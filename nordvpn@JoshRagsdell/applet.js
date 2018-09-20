const Applet = imports.ui.applet;
const Settings = imports.ui.settings;
const Util = imports.misc.util;
const Main = imports.ui.main;
const SignalManager = imports.misc.signalManager;
const Mainloop = imports.mainloop;

const loopInterval = 5000;

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

        this.settings = new Settings.AppletSettings(this, "nordvpn@JoshRagsdell", instance_id);
        this.signals = new SignalManager.SignalManager(null);

        this.settings.bindProperty(Settings.BindingDirection.IN,"country","country",this.on_settings_changed,null);
        this.settings.bindProperty(Settings.BindingDirection.IN,"killswitch","killswitch",this.on_settings_changed,null);
        this.settings.bindProperty(Settings.BindingDirection.IN,"protocol","protocol",this.on_settings_changed,null);
        this.settings.bindProperty(Settings.BindingDirection.IN,"cybersec","cybersec",this.on_settings_changed,null);
        this.settings.bindProperty(Settings.BindingDirection.IN,"notifications","notifications",this.on_settings_changed,null);

        this.signals.connect(this.settings, "changed::country", function(){
            var message = "";

            if (this.country === ""){
                message = "No country set. Auto-connect will pick best server. Please reconnect to VPN to enable the change.";
            } else {
                message = "Auto-connect will connect to %s. Please reconnect to VPN to enable the change.".format(this.country);
            }
            this._nordNotify(message);
        }.bind(this));

        this.signals.connect(this.settings, "changed::killswitch", this._settingChangedCallback.bind(this,"killswitch"));
        this.signals.connect(this.settings, "changed::cybersec", this._settingChangedCallback.bind(this,"cybersec"));
        this.signals.connect(this.settings, "changed::protocol", this._settingChangedCallback.bind(this,"protocol"));


        Util.spawn(['nordvpn','refresh']);
        this._updateCountryList();
        this.set_applet_icon_name("nordvpn");
        this.set_applet_tooltip(_("Click here to toggle VPN connection"));

        this.previousStatus = "disconnected";
        Util.spawn_async(['nordvpn','status'],this._connectionCallback.bind(this));

        this.isLooping = true;
        this.loopId = Mainloop.timeout_add(loopInterval, function() {
            if (!this.isLooping) {
              return false;
            }
            Util.spawn_async(['nordvpn','status'],this._connectionCallback.bind(this));
            return true;
        }.bind(this));
    },

    _nordNotify: function(msg) {
        var notificationsOn = this.notifications;
        if (notificationsOn) {
            Main.notify("NordVPN",msg);
        }
    },

    _connectionCallback: function(stdout) {
        var newStatus = "";
        if (trim(stdout) == "You have been disconnected from NordVPN." || trim(stdout) == "You are not connected to NordVPN.") {
            this.set_applet_icon_name("nordvpn-white");
            this.set_applet_tooltip(_("NordVPN is not connected. Click here to connect."));
            newStatus = "disconnected";
        } else if (stdout.includes("You are connected to NordVPN.") || stdout.includes("Great! You are now connected")) {
            this.set_applet_icon_name("nordvpn");

            Util.spawn_async(['nordvpn','status'],
                function(status) {
                  this.set_applet_tooltip(_(trim(status)));
                }.bind(this)
            );

            newStatus = "connected";
        } else {
            this.set_applet_icon_name("nordvpn-white");
            this.set_applet_tooltip(_("Status unknown"));
            // this._nordNotify("Connection status is uknown.");
            newStauts = "unknown";
        }

        if (newStatus != this.previousStatus) {
            this.previousStatus = newStatus;
            this._nordNotify(stdout);
        }
    },

    _settingChangedCallback: function(setting) {
        var value = this[setting];

        if (typeof value === "boolean") {
            if (value) {
                value = "enable";
            } else {
                value = "disable";
            }
        }

        Util.spawn_async(["nordvpn","set",setting,value],this._nordNotify.bind(this));
    },

    _clickToggleCallback: function(status) {
        var args = ['nordvpn'];
        if (trim(status) == 'You are not connected to NordVPN.') {
            args.push('connect');

            if (this.country !== "") {
                args.push(this.country);
            }

        } else {
            args.push('disconnect');
        }

        Util.spawn_async(args, this._connectionCallback.bind(this));
    },

    _updateCountryList: function() {
        Util.spawn_async(["nordvpn","countries"],
            function(countries) {

                var countryValues = trim(countries).split('\n');
                var countryDescriptions = trim(countries).replace(/_/g , " ").split('\n');

                var options = { None: "" };

                for (var i = 0; i < countryDescriptions.length; i++) {
                    options[countryDescriptions[i]] = countryValues[i];
                }

                this.settings.setOptions("country", options);

            }.bind(this)
        );
    },

    on_applet_removed_from_panel: function() {
      Mainloop.source_remove(this.loopId);
      this.loopId = 0;
      this.isLooping = false;
    },

    on_applet_clicked: function() {
        Util.spawn_async(['nordvpn','status'], this._clickToggleCallback.bind(this));
    }
};

function main(metadata, orientation, panel_height, instance_id) {
    return new NordVPNApplet(orientation, panel_height, instance_id);
}
