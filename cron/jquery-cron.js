/*
 * Forked from http://shawnchin.github.com/jquery-cron
 *
 * Copyright (c) 2010-2013 Shawn Chin.
 * Dual licensed under the MIT or GPL Version 2 licenses.
 *
 * Requires:
 * - jQuery
 *
 * Usage:
 *  (JS)
 *
 *  // initialise like this
 *  var c = $('#cron').cron({
 *    initial: '9 10 * * *', # Initial value. default = "* * * * *"
 *    url_set: '/set/', # POST expecting {"cron": "12 10 * * 6"}
 *  });
 *
 *  // you can update values later
 *  c.cron("value", "1 2 3 4 *");
 *
 * // you can also get the current value using the "value" option
 * alert(c.cron("value"));
 *
 *  (HTML)
 *  <div id='cron'></div>
 *
 * Notes:
 * At this stage, we only support a subset of possible cron options.
 * For example, each cron entry can only be digits or "*", no commas
 * to denote multiple entries. We also limit the allowed combinations:
 * - Every minute : * * * * *
 * - Every hour   : ? * * * *
 * - Every day    : ? ? * * *
 * - Every week   : ? ? * * ?
 * - Every month  : ? ? ? * *
 * - Every year   : ? ? ? ? *
 */
(function($) {

    var defaults = {
        initial : "* * * * *",
        url_set : undefined,
        customValues : undefined,
        periods : ["minute", "hour", "day", "week", "month", "year"],
        onChange: undefined, // callback function each time value changes
    };

    // -------  build some static data -------

    function option(options)  {
        return ' <option value="'+options.value+'"">'+options.text+'</option> ';
    }

    function span(options) {
        return ' <span class="'+options["class"]+'"">'+options.text+'</span> ';
    }

    function selectOptions(options) {
        return ' <select class="'+options["class"]+'"">'+options.text+'</select> ';
    }

    // options for minutes in an hour
    var str_opt_mih = "";
    for (var i = 0; i < 60; i++) {
        var j = (i < 10)? "0":"";
        str_opt_mih += option({ text: j+i, value: i });
    }

    // options for hours in a day
    var str_opt_hid = "";
    for (var i = 0; i < 24; i++) {
        var j = (i < 10)? "0":"";
        str_opt_hid += option({ text: j+i, value: i });
    }
    // options for days of month
    var str_opt_dom = "";
    for (var i = 1; i < 32; i++) {
        if (i == 1 || i == 21 || i == 31) { var suffix = "st"; }
        else if (i == 2 || i == 22) { var suffix = "nd"; }
        else if (i == 3 || i == 23) { var suffix = "rd"; }
        else { var suffix = "th"; }
        str_opt_dom += option({ text: i + suffix, value: i });
    }
    str_opt_dom += option({ text: "last day of the month", value: "L" });

    // options for months
    var str_opt_month = "";
    var months = ["January", "February", "March", "April",
                  "May", "June", "July", "August",
                  "September", "October", "November", "December"];
    for (var i = 0; i < months.length; i++) {
        str_opt_month += option({ text: months[i], value: i+1 });
    }

    // options for day of week
    var str_opt_dow = "";
    var days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday",
                "Friday", "Saturday"];
    for (var i = 0; i < days.length; i++) {
        str_opt_dow += option({ text: days[i], value: i });
    }

    // display matrix
    var toDisplay = {
        "minute" : [],
        "hour"   : ["mins"],
        "day"    : ["time"],
        "week"   : ["dow", "time"],
        "month"  : ["dom", "time"],
        "year"   : ["dom", "month", "time"]
    };

    var combinations = {
        "minute" : /^(\*\s){4}\*$/,                                          // "* * * * *"
        "hour"   : /^\d{1,2}(,\d{1,2})*\s(\*\s){3}\*$/,                      // "? * * * *"
        "day"    : /^(\d{1,2}(,\d{1,2})*\s){2}(\*\s){2}\*$/,                 // "? ? * * *"
        "week"   : /^(\d{1,2}(,\d{1,2})*\s){2}(\*\s){2}\d{1,2}(,\d{1,2})*$/, // "? ? * * ?"
        "month"  : /^((L|\d{1,2})(,\d{1,2})*(,L)?\s){3}\*\s\*$/,             // "? ? ? * *"
        "year"   : /^((L|\d{1,2})(,\d{1,2})*(,L)?\s){4}\*$/                  // "? ? ? ? *"
    };

    // ------------------ internal functions ---------------
    function defined(obj) {
        if (typeof obj == "undefined") { return false; }
        else { return true; }
    }

    function undefinedOrObject(obj) {
        return (!defined(obj) || typeof obj == "object")
    }

    function getCronType(cron_str, opts) {
        // if customValues defined, check for matches there first
        if (defined(opts.customValues)) {
            for (key in opts.customValues) {
                if (cron_str == opts.customValues[key]) { return key; }
            }
        }

        // check format of initial cron value
        var valid_cron = /^(((L|\d{1,2})(,\d{1,2})*(,L)?|\*)\s){4}(\d{1,2}(,\d{1,2})*|\*)$/
        if (typeof cron_str != "string" || !valid_cron.test(cron_str)) {
            $.error("cron: invalid initial value");
            return undefined;
        }

        // check actual cron values
        var d = cron_str.split(" ");
        //            mm, hh, DD, MM, DOW
        var minval = [ 0,  0,  1,  1,  0];
        var maxval = [59, 23, 31, 12,  6];
        for (var i = 0; i < d.length; i++) {
            if (d[i] == "*") continue;
            var v = parseInt(d[i]);
            if (isNaN(v)) {
                if (d[i] === "L") continue;
            } else if (defined(v) && v <= maxval[i] && v >= minval[i]) {
                continue;
            }

            $.error("cron: invalid value found (col "+(i+1)+") in " + o.initial);
            return undefined;
        }

        // determine combination
        for (var t in combinations) {
            if (combinations[t].test(cron_str)) { return t; }
        }

        // unknown combination
        $.error("cron: valid but unsupported cron format. sorry.");
        return undefined;
    }

    function hasError(c, o) {
        if (!defined(getCronType(o.initial, o))) { return true; }
        if (!undefinedOrObject(o.customValues)) { return true; }

        // ensure that customValues keys do not coincide with existing fields
        if (defined(o.customValues)) {
            for (key in o.customValues) {
                if (combinations.hasOwnProperty(key)) {
                    $.error("cron: reserved keyword '" + key +
                            "' should not be used as customValues key.");
                    return true;
                }
            }
        }

        return false;
    }

    function getCurrentValue(c) {
        var b = c.data("block");
        var min = hour = day = month = dow = "*";
        var selectedPeriod = b["period"].find("select").val();
        switch (selectedPeriod) {
            case "minute":
                break;

            case "hour":
                min = b["mins"].find("select").val();
                break;

            case "day":
                min  = b["time"].find("select.cron-time-min").val();
                hour = b["time"].find("select.cron-time-hour").val();
                break;

            case "week":
                min  = b["time"].find("select.cron-time-min").val();
                hour = b["time"].find("select.cron-time-hour").val();
                dow  =  b["dow"].find("select").val();
                break;

            case "month":
                min  = b["time"].find("select.cron-time-min").val();
                hour = b["time"].find("select.cron-time-hour").val();
                day  = b["dom"].find("select").val();
                break;

            case "year":
                min  = b["time"].find("select.cron-time-min").val();
                hour = b["time"].find("select.cron-time-hour").val();
                day  = b["dom"].find("select").val();
                month = b["month"].find("select").val();
                break;

            default:
                // we assume this only happens when customValues is set
                return selectedPeriod;
        }
        return [min, hour, day, month, dow].join(" ");
    }

    // -------------------  PUBLIC METHODS -----------------

    var methods = {
        init : function(opts) {

            // init options
            var options = opts ? opts : {}; /* default to empty obj */
            var o = $.extend([], defaults, options);

            // error checking
            if (hasError(this, o)) { return this; }

            // ---- define select boxes in the right order -----

            // options for period
            var str_opt_period = "";
            for (var i = 0; i < o.periods.length; i++) {
                str_opt_period += option({ text: o.periods[i], value: o.periods[i] });
            }

            var block = [], custom_periods = "", cv = o.customValues;
            if (defined(cv)) { // prepend custom values if specified
                for (var key in cv) {
                    custom_periods += option({ text: key, value: cv[key] });
                }
            }

            var periodSelect = selectOptions({ text: custom_periods + str_opt_period, name: "cron-period" });
            block["period"] = $(span({ text: "Every " + periodSelect, 'class': "cron-period" }))
                .appendTo(this)
                .data("root", this);

            var select = block["period"].find("select");
            select.bind("change.cron", event_handlers.periodChanged)
                  .data("root", this);

            var blockSelect = selectOptions({ text: str_opt_dom, name: "cron-dom" });
            block["dom"] = $(span({ text: " on the " + blockSelect, 'class': "cron-block cron-block-dom"}))
                .appendTo(this)
                .data("root", this);

            select = block["dom"].find("select").data("root", this);

            var monthSelect = selectOptions({ text: str_opt_month, name: "cron-month" });
            block["month"] = $(span({ text: " of " + monthSelect, 'class': "cron-block cron-block-month" }))
                .appendTo(this)
                .data("root", this);

            select = block["month"].find("select").data("root", this);

            var minSelect = selectOptions({ text: str_opt_mih, name: "cron-mins" });
            block["mins"] = $(span({ text: " at " + minSelect + " minutes past the hour ", 'class': "cron-block cron-block-mins" }))
                .appendTo(this)
                .data("root", this);

            select = block["mins"].find("select").data("root", this);

            var dowSelect = selectOptions({ text: str_opt_dow, name: "cron-dow" });
            block["dow"] = $(span({ text: " on " + dowSelect, 'class': "cron-block cron-block-dow" }))
                .appendTo(this)
                .data("root", this);

            select = block["dow"].find("select").data("root", this);

            var hourSelect = selectOptions({ text: str_opt_hid, name: "cron-time-hour", 'class': "cron-time-hour" }),
                minSelect = selectOptions({ text: str_opt_mih, name: "cron-time-min", 'class': "cron-time-min" });

            block["time"] = $(span({ text: " at " + hourSelect + ":" + minSelect, 'class': "cron-block cron-block-time" }))
                .appendTo(this)
                .data("root", this);

            select = block["time"].find("select.cron-time-hour").data("root", this);
            select = block["time"].find("select.cron-time-min").data("root", this);

            var saveButton = span({ 'class': "cron-button cron-button-save" });
            block["controls"] = $(span({ text: " &laquo; save " + saveButton, 'class': "cron-controls"}))
                .appendTo(this)
                .data("root", this)
                .find("span.cron-button-save")
                    .bind("click.cron", event_handlers.saveClicked)
                    .data("root", this)
                    .end();

            this.find("select").bind("change.cron-callback", event_handlers.somethingChanged);
            this.data("options", o).data("block", block); // store options and block pointer
            this.data("current_value", o.initial); // remember base value to detect changes

            return methods["value"].call(this, o.initial); // set initial value
        },

        value : function(cron_str) {
            // when no args, act as getter
            if (!cron_str) { return getCurrentValue(this); }

            var o = this.data('options');
            var block = this.data("block");
            var t = getCronType(cron_str, o);

            if (!defined(t)) { return false; }

            if (defined(o.customValues) && o.customValues.hasOwnProperty(t)) {
                t = o.customValues[t];
            } else {
                var d = cron_str.split(" ");
                var v = {
                    "mins"  : d[0],
                    "hour"  : d[1],
                    "dom"   : d[2],
                    "month" : d[3],
                    "dow"   : d[4]
                };

                // update appropriate select boxes
                var targets = toDisplay[t];
                for (var i = 0; i < targets.length; i++) {
                    var tgt = targets[i];
                    if (tgt == "time") {
                        var btgt = block[tgt].find("select.cron-time-hour").val(v["hour"]);
                        btgt = block[tgt].find("select.cron-time-min").val(v["mins"]);
                    } else {;
                        var btgt = block[tgt].find("select").val(v[tgt]);
                    }
                }
            }

            // trigger change event
            var bp = block["period"].find("select").val(t);
            bp.trigger("change");

            return this;
        }

    };

    var event_handlers = {
        periodChanged : function() {
            var root = $(this).data("root");
            var block = root.data("block"),
                opt = root.data("options");
            var period = $(this).val();

            root.find("span.cron-block").hide(); // first, hide all blocks
            if (toDisplay.hasOwnProperty(period)) { // not custom value
                var b = toDisplay[$(this).val()];
                for (var i = 0; i < b.length; i++) {
                    block[b[i]].show();
                }
            }
        },

        somethingChanged : function() {
            root = $(this).data("root");
            // if AJAX url defined, show "save"/"reset" button
            if (defined(root.data("options").url_set)) {
                if (methods.value.call(root) != root.data("current_value")) { // if changed
                    root.addClass("cron-changed");
                    root.data("block")["controls"].fadeIn();
                } else { // values manually reverted
                    root.removeClass("cron-changed");
                    root.data("block")["controls"].fadeOut();
                }
            } else {
                root.data("block")["controls"].hide();
            }

            // chain in user defined event handler, if specified
            var oc = root.data("options").onChange;
            if (defined(oc) && $.isFunction(oc)) {
                oc.call(root);
            }
        },

        saveClicked : function() {
            var btn  = $(this);
            var root = btn.data("root");
            var cron_str = methods.value.call(root);

            if (btn.hasClass("cron-loading")) { return; } // in progress
            btn.addClass("cron-loading");

            $.ajax({
                type : "POST",
                url  : root.data("options").url_set,
                data : { "cron" : cron_str },
                success : function() {
                    root.data("current_value", cron_str);
                    btn.removeClass("cron-loading");
                    // data changed since "save" clicked?
                    if (cron_str == methods.value.call(root)) {
                        root.removeClass("cron-changed");
                        root.data("block").controls.fadeOut();
                    }
                },
                error : function() {
                    alert("An error occured when submitting your request. Try again?");
                    btn.removeClass("cron-loading");
                }
            });
        }
    };

    $.fn.cron = function(method) {
        if (methods[method]) {
            return methods[method].apply(this, Array.prototype.slice.call(arguments, 1));
        } else if (typeof method === 'object' || ! method) {
            return methods.init.apply(this, arguments);
        } else {
            $.error( 'Method ' +  method + ' does not exist on jQuery.cron' );
        }
    };

})(jQuery);
