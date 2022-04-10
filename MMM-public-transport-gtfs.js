Module.register("MMM-public-transport-gtfs", {
	defaults: {
		gtfsDataUrl: "",
		// every minute
		domUpdateInterval: 60000,
		// daily
		dataUpdateInterval: 86400000,
		// show next 5 transports
		display: 10,

		use24HrClock: true,

		stops: [],
	},

	requiresVersion: "2.1.0", // Required version of MagicMirror

	parsedData: [],

	dayColumns: ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"],

	routeTypesMap: {
		0: "<i class=\"fas fa-train\"></i>",	// tram, light-rail
		1: "<i class=\"fas fa-subway\"></i>",	// subway
		2: "<i class=\"fas fa-train\"></i>",	// long distance rail
		3: "<i class=\"fas fa-bus-alt\"></i>",	// bus
		4: "<i class=\"fas fa-ship\"></i>",		// ferry
		5: "<i class=\"fas fa-tram\"></i>",		// cable tram
		6: "<i class=\"fas fa-tram\"></i>",		// aerial lift
		7: "<i class=\"fas fa-train\"></i>",	// funicular
		11: "<i class=\"fas fa-bus-alt\"></i>",	// trolleybus
		12: "<i class=\"fas fa-train\"></i>",	// monorail
		800: "<i class=\"fas fa-bus-alt\"></i>",// trolleybus, blame "Rīgas satiksme" for this
		900: "<i class=\"fas fa-train\"></i>",	// tram, blame "Rīgas satiksme" for this
	},

	dataNotification: [],

	getScripts: function() {
		return [];
	},

	getStyles: function () {
		return [
			"MMM-public-transport-gtfs.css",
			"font-awesome.css",
		];
	},

	// Load translations files
	getTranslations: function() {
		return {
			en: "translations/en.json",
		};
	},

	// socketNotificationReceived from helper
	socketNotificationReceived: function (notification, payload) {
		if (notification === this.name + "-SET_GTFS") {
			this.processData(payload);
		} else if (notification === this.name + "-SET_NOTIFICATIONS") {
			this.dataNotification.push(payload);
		}
	},

	start: function() {
		var self = this;
		//Flag for check if module is loaded
		this.loaded = false;

		// Schedule update timer.
		this.getData();

		setInterval(function() {
			self.updateDom();
		}, this.config.domUpdateInterval);
	},

	getData: function() {
		this.sendSocketNotification(this.name + "-GET_GTFS", {stops: this.config.stops, url: this.config.gtfsDataUrl});
	},

	scheduleUpdate: function() {
		var nextLoad = this.config.dataUpdateInterval;
		var self = this;
		setTimeout(function() {
			self.getData();
		}, nextLoad);
	},

	getDom: function() {
		var self = this;
		// create element wrapper for show into the module
		var wrapper = document.createElement("div");
		// If this.dataRequest is not empty
		if (this.dataRequest) {
			var wrapperDataRequest = document.createElement("div");

			var content = "";
			var currentTime = new Date();

			var nextStops = [];

			var chooseNextStops = function(stopTime, index, array){
				if (
					stopTime.departure_time.getMinutes() > currentTime.getMinutes()
					|| stopTime.departure_time.getHours() > currentTime.getHours()
				) {
					var trip = self.dataRequest.trips[stopTime.trip_id];
					var calendar = self.dataRequest.serviceCalendar[trip.service_id];
					var calendarExceptions = self.dataRequest.calendarExceptions[trip.service_id];
					var hasCalendar = typeof calendar !== "undefined";

					if (
						(!hasCalendar || self.isInTimePeriod(currentTime, calendar.start_date, calendar.end_date))
						&& (
							(hasCalendar && calendar[self.dayColumns[currentTime.getDay()]] === 1)
							|| self.isEnabledByException(currentTime, calendarExceptions)
						)
						&& !self.isDisabledByExceptions(currentTime, calendarExceptions)
					) {
						nextStops.push(stopTime);
					}
				}

				return nextStops.length < self.config.display;
			};

			for(var i = 0; i < 24; i++) {
				var checkingHour = currentTime.getHours() + (i > 0 ? 1 : 0);
				currentTime.setMinutes((i > 0 ? 0 : currentTime.getMinutes()));
				if (checkingHour > 23){
					currentTime.setDate(currentTime.getDate() + 1);
					checkingHour = 0;
				}

				currentTime.setHours(checkingHour);

				if (typeof this.dataRequest.stopTimes[checkingHour] !== "undefined") {
					this.dataRequest.stopTimes[checkingHour].every(chooseNextStops);
				}

				if (nextStops.length >= this.config.display) {
					break;
				}
			}

			nextStops.forEach(function(nextStop, index, array){
				var trip = self.dataRequest.trips[nextStop.trip_id]
				var route = self.dataRequest.routes[trip.route_id];
				content += "<table class='small align-left'>";
				content += "<tr>";
				content += 		"<th class='detail detail-route' colspan='2'>";
				content +=			"<span class='detail-span'>";
				content += 				(typeof route.route_color !== "undefined" ? "<span style='color: #" + route.route_color + "'>" : "")
											+ self.routeTypesMap[route.route_type]
										+ (typeof route.route_color !== "undefined" ? "</span>" : "")
										+ " " + route.route_short_name + " : " + route.route_long_name;
				content +=			"</span>";
				content += 		"</th>";
				content += "</tr>";
				content += "<tr>";
				content += 		"<td class='detail detail-departure-time align-center " + (!self.config.use24HrClock ? "hr12-clock" : "") + "' rowspan='3'>";
				content +=			"<span class='detail-span'>";
				content += 				self.getClockTimeString(nextStop.departure_time);
				content +=			"</span>";
				content += 		"</td>";
				content += "</tr>";
				content += "<tr>";
				content += 		"<td class='detail detail-stop'>";
				content +=			"<span class='detail-span'>";
				content += 				"<i class=\"fas fa-map-marker-alt\"></i> " + self.dataRequest.stops[nextStop.stop_id].stop_name;
				content +=			"</span>";
				content += 		"</td>";
				content += "</tr>";
				content += "<tr>";
				content += 		"<td class='detail detail-direction'>";
				content +=			"<span class='detail-span'>";
				content += 				"<i class=\"fas fa-map-pin\"></i> " + trip.trip_headsign
				content +=			"</span>";
				content += 		"</td>";
				content += "</tr>";
				content += "</table>";
			});

			wrapperDataRequest.innerHTML = content;

			wrapper.appendChild(wrapperDataRequest);
		}

		// Data from helper
		if (this.dataNotification.length > 0) {
			var wrapperDataNotification = document.createElement("div");
			this.dataNotification.forEach(function(notification, index, array) {
				wrapperDataNotification.innerHTML +=  self.translate(notification.code) + " " + notification.additionalData.replace(/\\n/g, "\n") + "<br>";
			});
			wrapper.appendChild(wrapperDataNotification);
		}
		return wrapper;
	},

	processData: function(data) {
		// in notification Date gets converted to string... converting it back to date for convenience
		Object.keys(data.stopTimes).forEach(function(hour, index, array) {
			data.stopTimes[hour].forEach(function(stopTime, index, array) {
				data.stopTimes[hour][index].departure_time = new Date(stopTime.departure_time);
				data.stopTimes[hour][index].arrival_time = new Date(stopTime.arrival_time);
			});
		});

		Object.keys(data.serviceCalendar).forEach(function(serviceId, index, array) {
			data.serviceCalendar[serviceId].start_date = new Date(data.serviceCalendar[serviceId].start_date);
			data.serviceCalendar[serviceId].end_date = new Date(data.serviceCalendar[serviceId].end_date);
		});

		Object.keys(data.calendarExceptions).forEach(function(serviceId, index, array) {
			data.calendarExceptions[serviceId].forEach(function(calendarException, index, array) {
				data.calendarExceptions[serviceId][index].date = new Date(data.calendarExceptions[serviceId][index].date);
			});
		});

		this.dataRequest = data;
		Log.info(this.name, "GTFS data processed");
		Log.debug(this.name, "GTFS data", data);

		if (this.loaded === false) { this.updateDom(this.config.animationSpeed); }
		this.loaded = true;
		this.scheduleUpdate();
	},

	isInTimePeriod(currentTime, startTime, endTime) {
		return startTime <= currentTime
			&& endTime >= currentTime;
	},

	isEnabledByException(currentTime, calendarExceptions) {
		return this.hasException(currentTime, calendarExceptions, "1");
	},

	isDisabledByExceptions(currentTime, calendarExceptions) {
		return this.hasException(currentTime, calendarExceptions, "2");
	},

	// Not a fan of naming these as exceptions either
	hasException(currentTime, calendarExceptions, exceptionType) {
		var exceptionOutcome = false;

		calendarExceptions.every(function(calendarException, index, array) {
			// if exception is today
			if(
				calendarException.date.getDate() === currentTime.getDay()
				&& calendarException.date.getMonth() === currentTime.getMonth()
				&& calendarException.date.getFullYear() === currentTime.getFullYear()
			) {
				exceptionOutcome = calendarException.exception_type === exceptionType; // 1 - new service just for this date, 2 - cancelled for today
				return false;
			}
		});

		return exceptionOutcome;
	},

	getDoubleDigitNumber(number) {
		while ((number + "").length < 2) {
			number = "0" + number;
		}

		return number;
	},

	// Yes, I could not find format method for date in JS *confused screeching*
	getClockTimeString(date) {
		var hours = date.getHours();
		var pm = "";
		if (!this.config.use24HrClock) {
			if (hours > 12) {
				hours -= 12;
				pm = " PM";
			} else {
				pm = " AM";
			}
		}

		return this.getDoubleDigitNumber(hours) + ":" + this.getDoubleDigitNumber(date.getMinutes()) + pm;
	}
});
