# MMM-public-transport-gtfs

This is a module for the [MagicMirror²](https://github.com/MichMich/MagicMirror/).

Aggregates compressed [GTFS static](https://developers.google.com/transit/gtfs) (General Transit Feed Specification) data and displays upcoming departure times of chosen public transportation stops.<br>

Currently, only tested with gtfs.zip provided by ["Rīgas satiksme"](https://www.rigassatiksme.lv/en/) and some randomly chosen GTFS sources.<br>
_Maybe worth adding list of tested sources, hmm_

![](screenshots\Screenshot.png)

## Using the module

To use this module:<br>
run these commands from MagicMirror directory (usually `~/MagicMirror`), to clone the repo and install dependencies
```shell
cd modules
git clone https://github.com/DanielsSt/MMM-public-transport-gtfs
cd MMM-public-transport-gtfs
npm install
```

afterwards add the following configuration block to the modules array in the `config/config.js` file and (re)start MagicMirror:
```js
var config = {
    modules: [
        {
            module: 'MMM-public-transport-gtfs',
            config: {
                // See below for configurable options
            }
        }
    ]
}
```

## Configuration options

| Option           | Description                                               
|----------------- |-----------------------------------------------------------
| `gtfsDataUrl`        | *Required* URL to zipped GTFS data <br><br> **Type:** `string`(URL) <br> *Example* `https://saraksti.rigassatiksme.lv/riga/gtfs.zip`                         
| `stops`  | *Required* stop_ids of stops you want to display <br>(can be found on `stops.txt`)<br><br>**Type:** `string[]` <br>Default `[]`
| `domUpdateInterval`  | *Optional* Time between content updates on screen <br><br>**Type:** `int`(milliseconds) <br>Default `60000` milliseconds (1 minute)
| `dataUpdateInterval`  | *Optional* Time between GTFS data updates<br><br>**Type:** `int`(milliseconds) <br>Default `86400000` milliseconds (1 day)
| `display`  | *Optional* How many upcoming transports to display<br><br>**Type:** `int` <br>Default `10`
| `use24HrClock`  | *Optional* Display 24hr clock<br><br>**Type:** `bool` <br>Default `true`

### Example config

```js
config: {
    // url to GTFS data
    gtfsDataUrl: "https://saraksti.rigassatiksme.lv/riga/gtfs.zip",
    // update screen every 30 seconds
    domUpdateInterval: 30000,
    // update GTFS data daily
    dataUpdateInterval: 86400000,
    // show next 5 transports
    display: 5,
    // display time in 24hr format, or set to false - for 12hr clock
    use24HrClock: true,
    // find your stops in stops.txt
    stops: ["0709", "0079", "0075", "7980", "2017"]
}
```

## Useful resources

* [GTFS Static Overview](https://developers.google.com/transit/gtfs)
* [OpenMobilityData](https://transitfeeds.com/)
* [MagicMirror²](https://github.com/MichMich/MagicMirror/)

## Known issues
* Only one GTFS data source can be used, maybe I will implement a way to provide and aggregate multiple GTFS sources;
* Startup takes ~15 seconds, most of the time is spent to just download and unzip the GTFS archive;
* Results are not cached, meaning, data is downloaded and parsed after every restart;
* Noticed that sometimes departure times are 1 minute off of officially available information and some shady practices of GTFS (like custom route types) are used;
* Icons displayed next to the route are not complete set, since font-awesome does not provide icon for every possible transport;
