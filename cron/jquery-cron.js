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

  // -------  build some static data -------

  function option(options)  {
    return '<option value="'+options.value+'">'+options.text+'</option>';
  }

  function span(options) {
    return '<span class="'+options["class"]+'">'+options.text+'</span>';
  }

  function selectOptions(options) {
    options = options || {};
    var title = 'title="' + (options.title || '') + '"',
      name = 'name="' + (options.name || '') + '"',
      style = 'class="form-control ' + (options["class"] || '') + '"',
      data = options.data || '',
      text = options.text || '',
      multiple = options.multiple ? ' multiple="multiple" ' : '';

    return '<select ' + [title, name, style, data, multiple].join(" ") + '>' + text + '</select>';
  }

  function arrayToOptions(array) {
    var options = "";
    for (var i = 0; i < array.length; i++) {
      options += option({ text: array[i], value: array[i] });
    }
    return options;
  }

  function createTimezoneSelector(selector, options) {
    var options = options || {};
    var initial = options.initial,
      useRails = options.rails,
      $selector = $(selector);

    try {
      $selector.timezones();

      if (useRails) {
        var jsTimezones = $(selector).find("option");
        $.each(jsTimezones, function(i, tz) {
          var option = $(tz);
          var newZone = RailsTimeZone.to(option.val());
          if (newZone) {
            option.text("(GMT"+option.data("offset")+") " + newZone);
            option.val(newZone);
          } else {
            option.remove();
          }
        });
      }

      $selector.val(initial || moment().zone());
      if (options["class"]) {
        $selector.addClass(options["class"]);
      }

    } catch (error) {
      throw "Timezones not loaded!"
        + " Make sure your options are correct and all necessary libraries are loaded."
        + "\nhttp://www.jqueryscript.net/time-clock/Easy-Timezone-Picker-with-jQuery-Moment-js-Timezones.html\n" + error.message;
    }
  }

  // options for period
  var default_periods = ["minute", "hour", "day", "week", "month", "year"];
  var str_opt_period = arrayToOptions(default_periods);

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

  // options for twelve-hour format
  var str_opt_twelve_hour_fmt = "";
  for (var i = 1; i <= 12; i++) {
    var j = (i < 10)? "0":"";
    str_opt_twelve_hour_fmt += option({ text: j+i, value: i%12 });
  }

  var str_opt_am_pm = arrayToOptions(["am", "pm"]);

  // options for days of month
  var str_opt_dom = "";
  for (var i = 1; i < 32; i++) {
    if (i == 1 || i == 21 || i == 31) { var suffix = "st"; }
    else if (i == 2 || i == 22) { var suffix = "nd"; }
    else if (i == 3 || i == 23) { var suffix = "rd"; }
    else { var suffix = "th"; }
    str_opt_dom += option({ text: i + suffix, value: i });
  }

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
    "day"    : ["time", "timezone"],
    "week"   : ["dow", "time", "timezone"],
    "month"  : ["dom", "time", "timezone"],
    "year"   : ["dom", "month", "time", "timezone"]
  };

  var combinations = {
    "minute" : /^(\*\s){4}\*$/,                                          // "* * * * *"
    "hour"   : /^\d{1,2}(,\d{1,2})*\s(\*\s){3}\*$/,                      // "? * * * *"
    "day"    : /^(\d{1,2}(,\d{1,2})*\s){2}(\*\s){2}\*$/,                 // "? ? * * *"
    "week"   : /^(\d{1,2}(,\d{1,2})*\s){2}(\*\s){2}\d{1,2}(,\d{1,2})*$/, // "? ? * * ?"
    "month"  : /^((L|\d{1,2})(,\d{1,2})*(,L)?\s){3}\*\s\*$/,             // "? ? ? * *"
    "year"   : /^((L|\d{1,2})(,\d{1,2})*(,L)?\s){4}\*$/                  // "? ? ? ? *"
  };

  var defaults = {
    initial : "* * * * *",
    url_set : undefined,
    customValues : undefined,
    twelveHourFormat : false,
    periods : default_periods,
    periodOpts: {
      text: str_opt_period,
      name: "cron-period"
    },
    minuteOpts: {
      text: str_opt_mih,
      name: "cron-mins"
    },
    dowOpts: {
      text: str_opt_dow,
      name: "cron-dow"
    },
    domOpts: {
      lastOfMonth: false,
      text: str_opt_dom,
      name: "cron-dom"
    },
    monthOpts: {
      text: str_opt_month,
      name: "cron-month"
    },
    timeHourOpts: {
      text: str_opt_hid,
      name: "cron-time-hour",
    },
    timeMinuteOpts: {
      text: str_opt_mih,
      name: "cron-time-min",
    },
    timeAmPmOpts: {
      text: str_opt_am_pm,
      name: "cron-time-am-pm",
    },
    timezoneOpts: {
      enabled: false
    },
    onChange: undefined, // callback function each time value changes,
    afterCreate: undefined,
  };

  var twelve_hour_format = false;

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

  function notEvery(timeframe) {
    return timeframe !== "*";
  }

  function toIntArray(values) {
    if (notEvery(values)) {
      if (typeof values == "string") { values = values.split(","); }
      if (values) {
        values = values.map(function(i){ return parseInt(i) });
      }
      return values;
    }
  }

  function getFormValues(b) {
    var selectedPeriod = b["period"].find("select").val();

    var cron = {
      min: "*",
      hour: "*",
      day: "*",
      month: "*",
      dow: "*",
      selectedPeriod: selectedPeriod
    };

    var fields = {
      minute: ["mins"],
      day: ["min", "hour"],
      week: ["min", "hour", "dow"],
      month: ["min", "hour", "day"],
      year: ["min", "hour", "day", "month"]
    };

    var fieldValues = {
      mins:  b["mins"].find("select").val(),
      min:   b["time"].find("select[name=cron-time-min]").val(),
      hour:  b["time"].find("select[name=cron-time-hour]").val(),
      day:   b["dom"].find("select").val(),
      month: b["month"].find("select").val(),
      dow:   b["dow"].find("select").val()
    };


    if (twelve_hour_format) {
      var is_pm = b["time"].find("select[name=cron-time-am-pm]").val() == "pm";
      if (is_pm) {
        fieldValues.hour = parseInt(fieldValues.hour) + 12;
      }
    }

    if (fields[selectedPeriod]) {
      $.each(fields[selectedPeriod], function(i, field){
        var currentValue = cron[field];
        cron[field] = fieldValues[field] || currentValue;
      });
    } else {
      // we assume this only happens when customValues is set
      return selectedPeriod;
    }

    return cron;
  }

  function getCurrentValue(c) {
    var b = c.data("block");
    var cron = getFormValues(b);

    return [cron.min, cron.hour, cron.day, cron.month, cron.dow].join(" ");
  }

  // -------------------  PUBLIC METHODS -----------------

  var methods = {
    init : function(opts) {

      // init options
      var options = opts ? opts : {}; /* default to empty obj */
      var o = $.extend([], defaults, options);
      $.extend(o, {
        periodOpts     : $.extend({}, defaults.periodOpts, options.periodOpts),
        minuteOpts     : $.extend({}, defaults.minuteOpts, options.minuteOpts),
        domOpts        : $.extend({}, defaults.domOpts, options.domOpts),
        monthOpts      : $.extend({}, defaults.monthOpts, options.monthOpts),
        dowOpts        : $.extend({}, defaults.dowOpts, options.dowOpts),
        timeHourOpts   : $.extend({}, defaults.timeHourOpts, options.timeHourOpts),
        timeMinuteOpts : $.extend({}, defaults.timeMinuteOpts, options.timeMinuteOpts),
        timeAmPmOpts   : $.extend({}, defaults.timeAmPmOpts, options.timeAmPmOpts),
        timezoneOpts   : $.extend({}, defaults.timezoneOpts, options.timezoneOpts),
      });

      var str_opt_period = arrayToOptions(o.periods);
      $.extend(o.periodOpts, { text: str_opt_period });

      var custom_periods = "", cv = o.customValues;
      if (defined(cv)) { // prepend custom values if specified
        for (var key in cv) {
          custom_periods += option({ text: key, value: cv[key] });
        }
        $.extend(o.periodOpts, { text: custom_periods + str_opt_period });
      }
      // error checking
      if (hasError(this, o)) { return this; }

      // ---- define select boxes in the right order -----
      var block = [];

      var periodSelect = selectOptions(o.periodOpts);
      block["period"] = $(span({ text: "Every " + periodSelect, 'class': "cron-period" }))
        .appendTo(this)
        .data("root", this);

      var select = block["period"].find("select");
      select.bind("change.cron", event_handlers.periodChanged)
          .data("root", this);

      if (o.domOpts.lastOfMonth) {
        o.domOpts.text += option({ text: "last day of the month", value: "L" });
      }

      var blockSelect = selectOptions(o.domOpts);
      block["dom"] = $(span({ text: " on the " + blockSelect, 'class': "cron-block cron-block-dom"}))
        .appendTo(this)
        .data("root", this);

      select = block["dom"].find("select").data("root", this);

      var monthSelect = selectOptions(o.monthOpts);
      block["month"] = $(span({ text: " of " + monthSelect, 'class': "cron-block cron-block-month" }))
        .appendTo(this)
        .data("root", this);

      select = block["month"].find("select").data("root", this);

      var minSelect = selectOptions(o.minuteOpts);
      block["mins"] = $(span({ text: " at " + minSelect + " minutes past the hour ", 'class': "cron-block cron-block-mins" }))
        .appendTo(this)
        .data("root", this);

      select = block["mins"].find("select").data("root", this);

      var dowSelect = selectOptions(o.dowOpts);
      block["dow"] = $(span({ text: " on " + dowSelect, 'class': "cron-block cron-block-dow" }))
        .appendTo(this)
        .data("root", this);

      select = block["dow"].find("select").data("root", this);


      var am_pm = "";
      if (o.twelveHourFormat) {
        twelve_hour_format = true;
        o.timeHourOpts["text"] = str_opt_twelve_hour_fmt;
        am_pm = selectOptions(o.timeAmPmOpts);
        $(am_pm).val("am");
      }


      var hourSelect = selectOptions(o.timeHourOpts),
        minSelect = selectOptions(o.timeMinuteOpts);
      block["time"] = $(span({ text: " at " + hourSelect + ":" + minSelect + " " + am_pm, 'class': "cron-block cron-block-time" }))
        .appendTo(this)
        .data("root", this);

      select = block["time"].find("select[name=cron-time-hour]").data("root", this);
      select = block["time"].find("select[name=cron-time-min]").data("root", this);
      select = block["time"].find("select[name=cron-time-am-pm]").data("root", this);

      if (o.timezoneOpts.enabled) {
        var timezoneSelect = selectOptions({ text: "", name: "cron-timezone" });
        block["timezone"] = $(span({ text: " in the timezone " + timezoneSelect, 'class': "cron-block cron-block-timezone" }))
          .appendTo(this)
          .data("root", this);
        select = block["timezone"].find("select").data("root", this);
        createTimezoneSelector(select, o.timezoneOpts);
      }

      var saveButton = span({ 'class': "cron-button cron-button-save" });
      block["controls"] = $(span({ text: " &laquo; save " + saveButton, 'class': "cron-controls"}))
        .appendTo(this)
        .data("root", this)
        .find("span.cron-button-save")
          .bind("click.cron", event_handlers.saveClicked)
          .data("root", this)
          .end();

      var after_create = o.afterCreate;
      if (defined(after_create) && $.isFunction(after_create)) {
        after_create();
      }

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
            var btgt = block[tgt];
            if (twelve_hour_format) {
              var hour = parseInt(v["hour"]);
              var is_pm = hour >= 12;;
              if (is_pm) {
                block[tgt].find("select[name=cron-time-am-pm]").val("pm");
                v["hour"] = hour - 12;
              }
            }
            var btgt = block[tgt].find("select[name=cron-time-hour]").val(v["hour"]);
            btgt = block[tgt].find("select[name=cron-time-min]").val(v["mins"]);
          } else if (tgt !== "timezone") {
            var btgt = block[tgt].find("select");
            if (btgt.attr("multiple")) {
              v[tgt] = v[tgt].split(",");
            }
            btgt.val(v[tgt]);
          }
        }
      }

      // trigger change event
      var bp = block["period"].find("select").val(t);
      bp.trigger("change");

      return this;
    },

    timezone : function(timezone_str) {
      var timezone_select = this.data("block")["timezone"].find("select[name=cron-timezone]");
      return timezone_select.val();
    },

    timezoneOffset : function(offset_str) {
      var timezone_select = this.data("block")["timezone"].find("select[name=cron-timezone]"),
        offset = timezone_select.find('option:selected').data('offset');
      return offset;
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
          if ((b[i] !== "timezone") || (opt.timezoneOpts.enabled)) {
            block[b[i]].show();
          }
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
