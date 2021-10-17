var NodeHelper = require("node_helper");
var JSZip = require("jszip");
var axios = require("axios");
var Log = require("logger");
const {keys} = require("grunt/lib/grunt/option");

module.exports = NodeHelper.create({
	stops: [],
	url: "",
	gtfsFiles: [
		"stops.txt",
		"stop_times.txt",
		"trips.txt",
		"routes.txt",
		"calendar.txt",
		"calendar_dates.txt",
	],
	skippableGtfsFiles: [
		"calendar_dates.txt",
	],

	socketNotificationReceived: function(notification, payload) {
		if (notification === this.name + "-GET_GTFS") {
			this.stops = payload.stops;
			this.url = payload.url;

			if (this.url === null || this.url === ""){
				self.logError("URL not provided", "ERROR_NO_GTFS_URL");
				return;
			}

			if (this.stops.length === 0){
				self.logError("No stops provided", "ERROR_NO_STOPS");
				return;
			}

			this.getGtfsData();
		}
	},

	getGtfsData: function() {
		var self = this;
		var urlApi = this.url;

		// reset unzipped files
		this.unzippedGtfsData = {};
		this.filesUnzipped = 0;

		Log.info(self.name, "Pulling GTFS data", urlApi);
		axios.get(urlApi, {responseType: "arraybuffer"})
			.then(function(response) {
				if (response.status === 200) {
					Log.info(self.name, "GTFS data downloaded, unzipping");
					self.unzipGtfsData(response.data);
				} else {
					self.logError("Could not load data.", "ERROR_FAILED_DL", response.status);
				}
			}).catch(function(error){
				self.logError("Could not load data.!", "ERROR_FAILED_DL",
					{ message: error.message, stack: error.stack }
				);
				throw error;
			});
	},

	unzippedGtfsData: {},

	unzipGtfsData: function(zipContents) {
		var self = this;
		JSZip.loadAsync(zipContents).then(function (zip) {
			var contents = {};
			zip.forEach(function (relativePath, zipEntry) {
				if (self.gtfsFiles.indexOf(zipEntry.name) >= 0){
					contents[zipEntry.name] = zip.file(zipEntry.name).async("string");
				}
			});

			var contentKeys = Object.keys(contents);
			if (contentKeys.length !== self.gtfsFiles.length) {
				var missingSkippableFiles = 0;
				self.skippableGtfsFiles.forEach(function(filename, index, array){
					if(contentKeys.indexOf(filename) === -1) {
						missingSkippableFiles++;
					}
				});

				if ((contentKeys.length + missingSkippableFiles) !== self.gtfsFiles.length) {
					self.logError("Did not find all required files in Zip", "ERROR_INVALID_FILES",
						{expected: self.gtfsFiles, got: Object.keys(contents)}
					);
					throw new Error("Did not find all required files in Zip");
				}
			}

			return contents;
		}).then(function (contents) {
			self.gtfsFiles.forEach(function (filename, index, array) {
				self.unzippedGtfsData[filename.replace(".txt", "")] = [];
				if (typeof contents[filename] === "undefined"){
					self.unzipGtfsSync();
					return;
				}

				contents[filename].then(function(fileContents){
					var rowsRaw = fileContents.split("\n");
					var cols = rowsRaw[0].split(",").map(function(col) {return col.trim()});
					rowsRaw.shift();
					rowsRaw.forEach(function(row, index, array) {
						var rowCols = row.split(",");
						var rowParsed = {};
						rowCols.forEach(function(value, index, array) {
							rowParsed[cols[index]] = value.replace(/"/g, "");
						});
						self.unzippedGtfsData[filename.replace(".txt", "")].push(rowParsed);
					});
				}).catch(function (error) {
					self.logError("Failed to parse ZIP contents!", "ERROR_PARSE_ZIP",
						{ message: error.message, stack: error.stack }
					);
					throw error;
				}).finally(function() {
					self.unzipGtfsSync();
				});
			});
		}).catch(function (error) {
			self.logError("Failed to process ZIP", "ERROR_PROCESS_ZIP",
				{ message: error.message, stack: error.stack }
			);
			throw error;
		});
	},

	// If anyone knows better way to synchronise this mess, be my guest
	filesUnzipped: 0,
	unzipGtfsSync: function() {
		this.filesUnzipped++;
		if (this.filesUnzipped >= Object.keys(this.unzippedGtfsData).length){
			Log.info(this.name, "GTFS data unzipped, processing data!");

			try {
				var processedData = this.processGtfsData(this.unzippedGtfsData);
			} catch (error){
				this.logError("Failed to process txt file contents!", "ERROR_PROCESS_TXT",
					{ message: error.message, stack: error.stack }
				);
				throw error;
			}

			this.sendSocketNotification(this.name + "-SET_GTFS", processedData);
		}
	},

	processGtfsData: function(data) {
		var self = this;
		var stops = {};

		data.stops.every(function(stop, index, array){
			if (self.stops.indexOf(stop.stop_id) >= 0) {
				stops[stop.stop_id] = stop;
			}
			return Object.keys(stops).length < self.stops.length;
		});

		var stopTimes = {};
		var tripIds = [];
		// find needed stops
		data.stop_times.forEach(function(stop, index){
			if (self.stops.indexOf(stop.stop_id) >= 0) {
				var stopTimesFields = ["arrival_time","departure_time"];
				stopTimesFields.forEach(function(field, index, array) {
					stop[field] = self.parseGtfsTime(stop[field]);
				});
				// group by hours
				var hour = stop.departure_time.getHours();
				if (typeof stopTimes[hour] === "undefined") {
					stopTimes[hour] = [];
				}
				stopTimes[hour].push(stop);

				if (tripIds.indexOf(stop.trip_id) === -1) {
					tripIds.push(stop.trip_id);
				}
			}
		});

		// sort times
		Object.keys(stopTimes).forEach(function (hour, index, array){
			stopTimes[hour] = stopTimes[hour].sort(function(a, b){
				return a.departure_time - b.departure_time;
			})
		});

		var trips = {};
		var serviceIds = [];
		var routeIds = [];
		// find trips going to the stops
		data.trips.every(function(trip, index){
			var tripIdIndex = tripIds.indexOf(trip.trip_id);
			if (tripIdIndex >= 0) {
				trips[trip.trip_id] = trip;
				tripIds.splice(tripIdIndex, 1);
				if (routeIds.indexOf(trip.route_id) === -1) {
					routeIds.push(trip.route_id);
				}

				if (serviceIds.indexOf(trip.service_id) === -1) {
					serviceIds.push(trip.service_id);
				}
			}
			return tripIds.length > 0;
		});

		var routes = {};
		// find the routes
		data.routes.every(function(route, index){
			var routeIdIndex = routeIds.indexOf(route.route_id);
			if (routeIdIndex >= 0) {
				routes[route.route_id] = route;
				routeIds.splice(routeIdIndex, 1);
			}
			return routeIds.length > 0;
		});

		var serviceCalendar = {};
		var serviceIds_ = Array.from(serviceIds);
		// find days when transport is(not) usually available
		data.calendar.every(function(calendarRecord, index){
			var serviceIdIndex = serviceIds_.indexOf(calendarRecord.service_id);
			if (serviceIdIndex >= 0) {
				serviceCalendar[calendarRecord.service_id] = calendarRecord;

				var dateColumns = ["start_date", "end_date"];
				dateColumns.forEach(function(dateColumn, index, array){
					serviceCalendar[calendarRecord.service_id][dateColumn] = self.parseGtfsDate(
						serviceCalendar[calendarRecord.service_id][dateColumn]);
				});

				var dayColumns = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"];
				dayColumns.forEach(function(day, index, array) {
					serviceCalendar[calendarRecord.service_id][day] = parseInt(serviceCalendar[calendarRecord.service_id][day]);
				});

				serviceIds_.splice(serviceIdIndex, 1);
			}
			return serviceIds_.length > 0;
		});

		var calendarExceptions = {};
		// find dates when there is an planned exception - either new service appears or is unavailable
		data.calendar_dates.forEach(function (date, index, array){
			if (serviceIds.indexOf(date.service_id) >= 0) {
				if (typeof calendarExceptions[date.service_id] === "undefined") {
					calendarExceptions[date.service_id] = [];
				}
				date.date = self.parseGtfsDate(date.date);
				calendarExceptions[date.service_id].push(date);
			}
		});

		return {
			stops: stops,
			stopTimes: stopTimes,
			trips: trips,
			routes: routes,
			serviceCalendar: serviceCalendar,
			calendarExceptions: calendarExceptions,
		};
	},

	parseGtfsDate: function (dateStr) {
		return new Date(
			parseInt(dateStr.substr(0, 4)),
			parseInt(dateStr.substr(4, 2)),
			parseInt(dateStr.substr(6, 2))
		);
	},

	parseGtfsTime: function (timeStr) {
		return new Date(
			1970,
			1,
			1,
			parseInt(timeStr.substr(0, 2)),
			parseInt(timeStr.substr(3, 2)),
			parseInt(timeStr.substr(6, 2))
		);
	},

	logError: function(message, code, additionalData= null) {
		Log.error(this.name, code, message, additionalData);
		this.sendSocketNotification(this.name + "-SET_NOTIFICATIONS",
			{
				code: code,
				additionalData: (additionalData !== null ? "<br><pre>" + JSON.stringify(additionalData, null, 2) + "<pre>" : "")
			}
		);
	},

});
