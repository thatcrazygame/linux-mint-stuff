const Applet = imports.ui.applet;
const Settings = imports.ui.settings;
const Util = imports.misc.util;
const Main = imports.ui.main;
const Mainloop = imports.mainloop;

const loop_interval = 5000;

function LastPassApplet(orientation, panel_height, instance_id) {
    this._init(orientation, panel_height, instance_id);
}

function trim(str) {
    return str.replace(/(^\s+|\s+$)/g,'');
}

LastPassApplet.prototype = {
    __proto__: Applet.IconApplet.prototype,

    _init: function(orientation, panel_height, instance_id) {
        Applet.IconApplet.prototype._init.call(this, orientation, panel_height, instance_id);

        this.settings = new Settings.AppletSettings(this, "lastpass@thatcrazygame", instance_id);
        this.settings.bind("notifications","notifications",this.on_settings_changed.bind(this));

        this.set_applet_icon_name("lastpass");
        this.set_applet_tooltip("LastPass");

        // this.is_looping = true;
        // this.loop_id = Mainloop.timeout_add(loop_interval, function() {
        //     if (!this.is_looping) {
        //       return false;
        //     }
        //
        // }.bind(this));
    },

    notify: function(msg) {
        if (this.notifications) {
            Main.notify("LastPass",msg);
        }
    },

    on_settings_changed: function(value, setting) {


    },

    // on_applet_removed_from_panel: function() {
    //   Mainloop.source_remove(this.loop_id);
    //   this.loop_id = 0;
    //   this.is_looping = false;
    // },

    on_applet_clicked: function() {
        this.notify("Hello, world");
    }
};

function main(metadata, orientation, panel_height, instance_id) {
    return new LastPassApplet(orientation, panel_height, instance_id);
}
