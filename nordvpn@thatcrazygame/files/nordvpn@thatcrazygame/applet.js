const Applet = imports.ui.applet;
const Settings = imports.ui.settings;
const Util = imports.misc.util;
const Main = imports.ui.main;
const Mainloop = imports.mainloop;

const loop_interval = 5000;

function NordVPNApplet(orientation, panel_height, instance_id) {
    this._init(orientation, panel_height, instance_id);
}

function trim(str) {
    return str.replace(/(^\s+|\s+$)/g,'');
}

NordVPNApplet.prototype = {
    __proto__: Applet.IconApplet.prototype,

    _init: function(orientation, panel_height, instance_id) {
        Applet.IconApplet.prototype._init.call(this, orientation, panel_height, instance_id);

        this.settings = new Settings.AppletSettings(this, "nordvpn@thatcrazygame", instance_id);

        this.settings.bind("country","country",this.on_settings_changed.bind(this),"country");
        this.settings.bind("killswitch","killswitch",this.on_settings_changed.bind(this),"killswitch");
        this.settings.bind("protocol","protocol",this.on_settings_changed.bind(this),"protocol");
        this.settings.bind("cybersec","cybersec",this.on_settings_changed.bind(this),"cybersec");
        this.settings.bind("autoconnect","autoconnect",this.on_settings_changed.bind(this),"autoconnect");
        this.settings.bind("notifications","notifications",this.on_settings_changed.bind(this));

        Util.spawn(['nordvpn','refresh']);
        this.update_country_list();
        this.set_applet_icon_name("nordvpn");
        this.set_applet_tooltip(_("Click here to toggle VPN connection"));

        this.previous_status = "disconnected";
        Util.spawn_async(['nordvpn','status'],this.connection_callback.bind(this));

        this.is_looping = true;
        this.loop_id = Mainloop.timeout_add(loop_interval, function() {
            if (!this.is_looping) {
              return false;
            }
            Util.spawn_async(['nordvpn','status'],this.connection_callback.bind(this));
            return true;
        }.bind(this));
    },

    nord_notify: function(msg) {
        if (this.notifications) {
            Main.notify("NordVPN",msg);
        }
    },

    connection_callback: function(stdout) {
        var new_status = "";
        if (trim(stdout) == "You have been disconnected from NordVPN."
            || trim(stdout) == "You are not connected to NordVPN.") {
            this.set_applet_icon_name("nordvpn-white");
            this.set_applet_tooltip(_("NordVPN is not connected. Click here to connect."));
            new_status = "disconnected";
        } else if (stdout.includes("You are connected to NordVPN.")
            || stdout.includes("Great! You are now connected")) {
            this.set_applet_icon_name("nordvpn");

            Util.spawn_async(['nordvpn','status'],
                function(status) {
                  this.set_applet_tooltip(_(trim(status)));
                }.bind(this)
            );

            new_status = "connected";
        } else {
            this.set_applet_icon_name("nordvpn-white");
            this.set_applet_tooltip(_("Status unknown"));
            // this.nord_notify("Connection status is uknown.");
            new_status = "unknown";
        }

        if (new_status != this.previous_status) {
            this.previous_status = new_status;
            this.nord_notify(stdout);
        }
    },

    click_toggle_callback: function(status) {
        var args = ['nordvpn'];
        if (trim(status) == 'You are not connected to NordVPN.') {
            args.push('connect');

            if (this.country !== "") {
                args.push(this.country);
            }

        } else {
            args.push('disconnect');
        }

        Util.spawn_async(args, this.connection_callback.bind(this));
    },

    update_country_list: function() {
        Util.spawn_async(["nordvpn","countries"],
            function(countries) {

                var country_values = trim(countries).split('\n');
                var country_descriptions = trim(countries).replace(/_/g, " ").split('\n');

                var options = { None: "" };

                for (var i = 0; i < country_descriptions.length; i++) {
                    options[country_descriptions[i]] = country_values[i];
                }

                this.settings.setOptions("country", options);

            }.bind(this)
        );
    },

    on_settings_changed: function(value, setting) {
        if (setting == "country") {
            var message = "";

            if (this.country === ""){
                message = "No country set. Auto-connect will pick best server. Please reconnect to VPN to enable the change.";
            } else {
                message = "Auto-connect will connect to %s. Please reconnect to VPN to enable the change.".format(this.country.replace(/_/g," "));
            }
            this.nord_notify(message);

        } else if (setting != null) {
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


    on_applet_removed_from_panel: function() {
      Mainloop.source_remove(this.loop_id);
      this.loop_id = 0;
      this.is_looping = false;
    },

    on_applet_clicked: function() {
        Util.spawn_async(['nordvpn','status'], this.click_toggle_callback.bind(this));
    }
};

function main(metadata, orientation, panel_height, instance_id) {
    return new NordVPNApplet(orientation, panel_height, instance_id);
}
