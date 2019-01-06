const Applet = imports.ui.applet;
const Settings = imports.ui.settings;
const Util = imports.misc.util;
const Main = imports.ui.main;
const Mainloop = imports.mainloop;

const loop_interval = 5000;
const default_terminal = "gnome-terminal";
const MAXDNSIPS = 3;


function checkIsIPV4(entry) {
    var blocks = entry.split(".");
    if(blocks.length === 4) {
        return blocks.every(function(block) {
            return !isNaN(block) && parseInt(block,10) >=0 && parseInt(block,10) <= 255;
        });
    }
    return false;
}

function cmd_trim(str) {
    return str.replace(/(^\s+|\s+$)/g,'').replace(/^[-\\/|]\s*/gm,'');
}

function NordVPNApplet(orientation, panel_height, instance_id) {
    this._init(orientation, panel_height, instance_id);
}

NordVPNApplet.prototype = {
    __proto__: Applet.IconApplet.prototype,

    _init: function(orientation, panel_height, instance_id) {

        this.settings = new Settings.AppletSettings(this, "nordvpn@thatcrazygame", instance_id);

        this.settings.bind("country","country",this.on_location_changed.bind(this));
        this.settings.bind("killswitch","killswitch",this.on_settings_changed.bind(this),"killswitch");
        this.settings.bind("protocol","protocol",this.on_settings_changed.bind(this),"protocol");
        this.settings.bind("cybersec","cybersec",this.on_settings_changed.bind(this),"cybersec");
        this.settings.bind("autoconnect","autoconnect",this.on_settings_changed.bind(this),"autoconnect");
        this.settings.bind("obfuscate","obfuscate",this.on_settings_changed.bind(this),"obfuscate");
        this.settings.bind("notifications","notifications");

        this.settings.bind("dns","dns",this.on_dns_changed.bind(this));
        this.update_dns_settings();

        Util.spawn(['nordvpn','refresh']);

        this.city = "";
        this._cities_country = {};
        this.update_locations();
        this._prev_country = this.country;

        Applet.IconApplet.prototype._init.call(this, orientation, panel_height, instance_id);


        this.set_applet_icon_name("nordvpn");
        this.set_applet_tooltip("Click here to toggle VPN connection");

        this.previous_status = "disconnected";
        Util.spawn_async(['nordvpn','status'],this.connection_callback.bind(this));
        Util.spawn_async(["nordvpn","settings"],this.check_settings.bind(this));


        this.is_looping = true;
        this.loop_id = Mainloop.timeout_add(loop_interval, function() {
            if (!this.is_looping) {
              return false;
            }
            Util.spawn_async(['nordvpn','status'],this.connection_callback.bind(this));
            Util.spawn_async(['nordvpn','settings'],this.check_settings.bind(this));
            return true;
        }.bind(this));


    },

    nord_notify: function(msg) {
        if (this.notifications) {
            Main.notify("NordVPN",cmd_trim(msg));
        }
    },

    connection_callback: function(stdout) {
        var new_status = "";
        if (stdout.toLowerCase().includes("disconnected")) {
            this.set_applet_icon_name("nordvpn-white");
            this.set_applet_tooltip(_("NordVPN is not connected. Click here to connect."));
            new_status = "disconnected";
        } else if (stdout.includes("Status: Connected")) {
            this.set_applet_icon_name("nordvpn");

            Util.spawn_async(['nordvpn','status'],
                function(status) {
                  this.set_applet_tooltip(cmd_trim(status));
                }.bind(this)
            );

            // var regex_country = stdout.match(/^Country: (.+?)$/m);
            // var regex_city = stdout.match(/^City: (.+?)$/m);
            // global.log("TEST: " + regex_city[1] + ", " + regex_country[1]);

            new_status = "connected";
        } else if (stdout.toLowerCase().includes("disconnecting")) {
            this.set_applet_tooltip("Disconnecting, please wait.");
        } else if (stdout.toLowerCase().includes("connecting")) {
            this.set_applet_tooltip("Connecting, please wait.");
        } else if (stdout === "") {
            // not sure why stdout is empty when the not logged in message comes back
            stdout = "You need to log in first! Use the 'nordvpn login' command, or use the 'Log in' button in applet settings.";
            new_status = "loggedout";
        } else {
            this.set_applet_icon_name("nordvpn-white");
            this.set_applet_tooltip(_("Status unknown"));
            this.nord_notify("Connection status is uknown.\n" + stdout);
            new_status = "unknown";
        }

        if (new_status != this.previous_status) {
            this.previous_status = new_status;
            this.nord_notify(stdout);
        }
    },

    update_locations: function() {
        Util.spawn_async(["nordvpn","countries"],
            function(countries) {
                var country_values = countries.match(/[^\\/|-\s]+/gm).sort();

                var country_options = { None: "" };

                country_values.forEach(function(country, index){
                    var country_description = country.replace(/_/g, " ");
                    country_options[country_description] = country;

                    var cities_idx = "cities-" + index;
                    this.settings.settingsData[cities_idx].dependency = "country=" + country;
                    this.settings.settingsData[cities_idx].description = "Cities in " + country_description;

                    this._cities_country[country] = cities_idx;

                    Util.spawn_async(["nordvpn","cities",country],
                        function(cities) {
                            var city_values = cities.match(/[^\\/|-\s]+/gm).sort();

                            var city_options = { None: "" };

                            city_values.forEach(function(city){
                                var city_description = city.replace(/_/g, " ");
                                city_options[city_description] = city;
                            });

                            this.settings.setOptions(cities_idx, city_options);

                        }.bind(this)
                    );

                }.bind(this));

                this.settings.setOptions("country", country_options);

                if (this.country !== "") {
                    this.settings.bind(this._cities_country[this.country],"city",this.on_location_changed.bind(this));
                }

            }.bind(this)
        );
    },

    update_dns_settings: function() {
        this.settings.settingsData.layout1.section2.title = "DNS Severs (max: " + MAXDNSIPS + ")";
        for (var i = 0; i < MAXDNSIPS; i++) {
            var ipkey = "ip-" + i;
            delete this.settings.settingsData[ipkey].dependency;
            // this.settings.settingsData[ipkey].dependency = "dns=true";
            this.settings.settingsData[ipkey].description = "IP " + (i+1);

            this.settings.bind(ipkey,ipkey,this.on_dns_changed.bind(this));
        }
    },

    check_settings: function(stdout) {
        var cmd_settings = cmd_trim(stdout).toLowerCase().replace(/ /g, "").split("\n");

        for (var i = 0; i < cmd_settings.length; i++) {
            var setting = cmd_settings[i].split(":");

            if (this.hasOwnProperty(setting[0])) {
                if (setting[0] == "dns") {
                    if (setting[1] == "disabled") {
                        this.settings.setValue("dns",false);
                    } else {
                        this.settings.setValue("dns",true);
                        var ip_list = setting[1].split(",");
                        // global.log(ip_list);
                        for (var j=0; j<MAXDNSIPS; j++) {
                            if (ip_list[j]) {
                                this.settings.setValue("ip-"+j, ip_list[j]);
                            } else {
                                this.settings.setValue("ip-"+j, "");
                            }
                        }
                    }
                } else {
                    if (setting[1] == "enabled") {
                        setting[1] = true;
                    }

                    if (setting[1] == "disabled") {
                        setting[1] = false;
                    }

                    if (this.settings.getValue(setting[0]) != setting[1]) {
                        this.settings.setValue(setting[0],setting[1]);
                    }
                }
            }
        }
    },

    on_location_changed: function() {
        var message = "";
        if (this.country === ""){
            this.city = "";
            message = "No location set. Quick-connect will pick best server. Please reconnect to VPN to enable the change.";
        } else {
            if (this._prev_country !== "") {
                this.settings.unbind(this._cities_country[this._prev_country]);
            }
            this.settings.bind(this._cities_country[this.country],"city",this.on_location_changed.bind(this));

            var country_str = this.country.replace(/_/g," ")
            var city_str = ""
            if (this.city !== "") {
                city_str = this.city.replace(/_/g," ") + ", ";
            }

            message = "Quick-connect will connect to " + city_str + country_str + ". Please reconnect to VPN to enable the change.";
        }

        this._prev_country = this.country;
        global.log(this.city + ", " + this.country);
        this.nord_notify(message);
    },

    on_dns_changed: function() {
        var args = ["nordvpn","set","dns"];
        if (this.dns) {
            for (var i=0; i<MAXDNSIPS; i++){
                if (checkIsIPV4(this["ip-"+i])) {
                    args.push(this["ip-"+i]);
                }
            }
        } else {
            args.push("disable");
        }
        if (args.length > 3) {
            Util.spawn_async(args,function(stdout){
                if (!stdout.includes("DNS is already set")) {
                    this.nord_notify(stdout);
                }
            }.bind(this));
        }

    },

    on_settings_changed: function(value, setting) {
        if (setting != null) {
            if (typeof value === "boolean") {
                if (value) {
                    value = "enable";
                } else {
                    value = "disable";
                }
            }
            Util.spawn_async(["nordvpn","set",setting,value],this.nord_notify.bind(this));
        }
    },

    login: function() {
        Util.spawn([default_terminal,"--","nordvpn","login"]);
    },

    logout: function() {
        Util.spawn_async(["nordvpn","logout"],this.nord_notify.bind(this));
    },

    on_applet_removed_from_panel: function() {
      Mainloop.source_remove(this.loop_id);
      this.loop_id = 0;
      this.is_looping = false;
    },

    click_toggle_callback: function(status) {
        var args = ['nordvpn'];
        if (status.includes("Status: Disconnected")) {
            args.push('connect');

            if (this.country !== "") {
                args.push(this.country);
                if (this.city !== "") {
                    args.push(this.city);
                }
            }

        } else {
            args.push('disconnect');
        }
        Util.spawn_async(args, this.connection_callback.bind(this));
    },

    on_applet_clicked: function() {
        Util.spawn_async(['nordvpn','status'], this.click_toggle_callback.bind(this));
    }
};

function main(metadata, orientation, panel_height, instance_id) {
    return new NordVPNApplet(orientation, panel_height, instance_id);
}
