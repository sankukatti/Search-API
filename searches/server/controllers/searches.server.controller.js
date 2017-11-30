'use strict';

/**
 * Module dependencies.
 */
var path = require('path'),
    mongoose = require('mongoose'),
    config = require(path.resolve('./config/config')),
    errorHandler = require(path.resolve('./modules/core/server/controllers/errors.server.controller')),
    _ = require('lodash');

var CONF_SEARCH_FILE_BASE_PATH = '../../../../modules/';
var CONF_SEARCH_FILE_NAME = '/server/searchConfig/searchConfig';

var searchServices = require('../services/searchService.server');

/**
 * Common Search
 */
function search(query, entity) {

    /* Holds filters as objects.
     * Type - {field_name - field_value}
     * If type is range - {field_name - {min : min_value, max : max_value}}
     * */
    var filters = {};

    /* Holds search string.
    * Type - String*/
    var search = '';

    /* Holds the field_name on which result needs to be sorted.
    * Type - String*/
    var sort = null;

    /* Holds the order in which result needs to eb sorted.
    * Type - Enum [1,-1]
    * 1  - Ascending order.
    * -1 - Descending order
    * */
    var order = null;

    /*
    * For future - Sort on multiple fields. No yet implemented
    * */
    var sortFields = [];

    /* page     - Specifies current page number. Can be 1 to n.*/
    var page = '';

    /* per_page - Specifies required number of results per page.*/
    var per_page = '';

    return new Promise(function (resolve, reject) {
        /* _.forOwn : Iterate through an object's value and property*/
        _.forOwn(query, function(value, key) {

            /*
             * keys `q`, `sort`, `order`, `page`, `per_page` are default keys with specific meaning.
             * q        - Search string
             * sort     - Field to be sorted. There can be only one sort field per request.
             * order    - Specifies sort order. 1 - Ascending and -1 - Descending.
             * page     - Specifies current page number. Can be 1 to n.
             * per_page - Specifies required number of results per page.
             * */
            if (key !== 'q' && key !== 'sort' && key !== 'order' && key !== 'page' && key !== 'per_page') {

                /*
                 * For Ex: Key type us range, format is "[field_name]_range".
                 * Last underscore is the separator between filter_name and filter_type that is now range.
                 * So splitting the key by `_` will return an array whose last index will have filter_type.
                 *
                 * filter_value format for range type is [[min_value],[max_value]]
                 * */
                var keySplitArray = key.split('_');

                /* If filter_type is `range` and data type is number*/
                if (keySplitArray[keySplitArray.length - 1] === 'range') {
                    var min = value.split(',')[0];
                    var max = value.split(',')[1];

                    if (Number(min) < Number(max)) {
                        if ((min.length > 0) && (max.length > 0)) {
                            /* Get filter name except the last filter_type and separator*/
                            filters[key.substring(0, key.lastIndexOf('_'))] = {
                                'min': Number(min),
                                'max': Number(max)
                            };
                        }
                    } else {
                        if ((min.length > 0) && (max.length > 0)) {
                            filters[key.substring(0, key.lastIndexOf('_'))] = {
                                'min': Number(max),
                                'max': Number(min)
                            };
                        }
                    }

                    /* If filter_type is `dateRange` and data type is date*/
                } else if (keySplitArray[keySplitArray.length - 1] === 'dateRange') {
                    min = value.split(',')[0];
                    max = value.split(',')[1];

                    /* Get filter name except the last filter_type and separator*/
                    filters[key.substring(0, key.lastIndexOf('_'))] = {
                        'min': new Date(max),
                        'max': new Date(min)
                    };

                    /* Any other filters */
                } else {
                    if (value.length > 0) {
                        filters[key] = value;
                    }
                }

            } else if (key === 'sort') {
                sort = query.sort;
            } else if (key === 'order') {
                order = query.order;
            } else if (key === 'page') {
                page = query.page;
            } else if (key === 'per_page') {
                per_page = query.per_page;
            } else {
                search = query.q;
            }

        });

        /* For future. All all fields on which result needs to be sorted. */
        if (sort != null && sort.length > 0 && order != null && order.length > 0) {
            sortFields.push({ 'field': sort, 'order': order });
        }

        searchServices.search(search, filters, sortFields, [entity], page, per_page)
            .then(function(resolved) {
                return resolve(resolved);
            }, function(rejected) {
                return reject(rejected);
            });
    });
}

function mapSearchStart(req, radius, entity) {
    return new Promise(function (resolve, reject) {
        var boundAr = getBoundingBox([Number(req.query.lat), Number(req.query.lon)], radius, 'rectangle');

        /* var boundAr = getBoundsFromLatLng(Number(req.query.lat), Number(req.query.lon), radius);*/
        /* bound['lon1'] = boundAr[1][1];
         bound['lat1'] = boundAr[1][0];
         bound['lon2'] = boundAr[0][1];
         bound['lat2'] = boundAr[0][0];*/

        req.query.lat1 = boundAr[0][0];
        req.query.lon1 = boundAr[0][1];
        req.query.lat2 = boundAr[1][0];
        req.query.lon2 = boundAr[1][1];

        delete req.query.lat;
        delete req.query.lon;

        mapSearch(req, entity)
        .then(function (resolved) {
            return resolve(resolved);
        }, function (rejected) {
            return reject(rejected);
        });
    });
}

function mapSearch(req, entity) {
    return new Promise(function (resolve, reject) {
        var bound = {};
        var filters = {};
        var search = '';
        var sort = null;
        var order = null;
        var sortFields = [];
        var page = '';
        var per_page = '';

        _.forOwn(req.query, function(value, key) {
            if (key !== 'q' && key !== 'sort' && key !== 'order' && key !== 'page' && key !== 'per_page') {

                var keySplitArray = key.split('_');

                /* If filter_type is `range` and data type is number*/
                if (keySplitArray[keySplitArray.length - 1] === 'range') {
                    var min = value.split(',')[0];
                    var max = value.split(',')[1];

                    if (Number(min) < Number(max)) {
                        if ((min.length > 0) && (max.length > 0)) {
                            /* Get filter name except the last filter_type and separator*/
                            filters[key.substring(0, key.lastIndexOf('_'))] = {
                                'min': Number(min),
                                'max': Number(max)
                            };
                        }
                    } else {
                        if ((min.length > 0) && (max.length > 0)) {
                            filters[key.substring(0, key.lastIndexOf('_'))] = {
                                'min': Number(max),
                                'max': Number(min)
                            };
                        }
                    }

                    /* If filter_type is `dateRange` and data type is date*/
                } else if (keySplitArray[keySplitArray.length - 1] === 'dateRange') {
                    min = value.split(',')[0];
                    max = value.split(',')[1];

                    /* Get filter name except the last filter_type and separator*/
                    filters[key.substring(0, key.lastIndexOf('_'))] = {
                        'min': new Date(max),
                        'max': new Date(min)
                    };
                } else {
                    if (key === 'lat1' || key === 'lon1' || key === 'lat2' || key === 'lon2') {
                        bound[key] = Number(value);
                    } else if (value.length > 0) {
                        filters[key] = value;
                    }
                }
                /* End */
            } else if (key === 'sort') {
                sort = req.query.sort;
            } else if (key === 'order') {
                order = req.query.order;
            } else if (key === 'page') {
                page = req.query.page;
            } else if (key === 'per_page') {
                per_page = req.query.per_page;
            } else {
                search = req.query.q;
            }

        });

        if (sort !== null && sort.length > 0 && order !== null && order.length > 0) {
            sortFields.push({ 'field': sort, 'order': order });
        }

        searchServices.locationSearch(search, filters, sortFields, [entity], bound, page, per_page)
            .then(function(resolved) {
                return resolve(resolved);
            }, function(rejected) {
                return reject(rejected);
            });
    });
}

/**
 * @param {number} distance - distance (km) from the point represented by centerPoint
 * @param {array} centerPoint - two-dimensional array containing center coords [latitude, longitude]
 * @description
 *   Computes the bounding coordinates of all points on the surface of a sphere
 *   that has a great circle distance to the point represented by the centerPoint
 *   argument that is less or equal to the distance argument.
 *   Technique from: Jan Matuschek <http://JanMatuschek.de/LatitudeLongitudeBoundingCoordinates>
 * @author Alex Salisbury
 */
function getBoundingBox(centerPoint, distance, return_type) {
    var MIN_LAT,
        MAX_LAT,
        MIN_LON,
        MAX_LON,
        R,
        radDist,
        degLat,
        degLon,
        radLat,
        radLon,
        minLat,
        maxLat,
        minLon,
        maxLon,
        deltaLon;

    if (distance < 0) {
        return 'Illegal arguments';
    }

    /* helper functions (degrees<–>radians)*/
    Number.prototype.degToRad = function () {
        return this * (Math.PI / 180);
    };
    Number.prototype.radToDeg = function () {
        return (180 * this) / Math.PI;
    };

    /* coordinate limits*/
    MIN_LAT = (-90).degToRad();
    MAX_LAT = (90).degToRad();
    MIN_LON = (-180).degToRad();
    MAX_LON = (180).degToRad();

    /* Earth's radius (km)*/
    R = 6378.1;

    /* angular distance in radians on a great circle*/
    radDist = distance / R;

    /* center point coordinates (deg)*/
    degLat = centerPoint[0];
    degLon = centerPoint[1];

    /* center point coordinates (rad)*/
    radLat = degLat.degToRad();
    radLon = degLon.degToRad();

    /* minimum and maximum latitudes for given distance*/
    minLat = radLat - radDist;
    maxLat = radLat + radDist;

    /* minimum and maximum longitudes for given distance*/
    minLon = void 0;
    maxLon = void 0;

    /* define deltaLon to help determine min and max longitudes*/
    deltaLon = Math.asin(Math.sin(radDist) / Math.cos(radLat));
    if (minLat > MIN_LAT && maxLat < MAX_LAT) {
        minLon = radLon - deltaLon;
        maxLon = radLon + deltaLon;
        if (minLon < MIN_LON) {
            minLon = minLon + 2 * Math.PI;
        }
        if (maxLon > MAX_LON) {
            maxLon = maxLon - 2 * Math.PI;
        }
    } else { /* a pole is within the given distance*/
        minLat = Math.max(minLat, MIN_LAT);
        maxLat = Math.min(maxLat, MAX_LAT);
        minLon = MIN_LON;
        maxLon = MAX_LON;
    }
    if (return_type === 'rectangle')
        return [
            [minLat.radToDeg(), minLon.radToDeg()],
            [maxLat.radToDeg(), maxLon.radToDeg()]
        ];
    else if (return_type === 'string')
        return minLon.radToDeg() + ',' + minLat.radToDeg() + ',' + maxLon.radToDeg() + ',' + maxLat.radToDeg();
    else if (return_type === 'array') {
        return [
            minLon.radToDeg(),
            minLat.radToDeg(),
            maxLon.radToDeg(),
            maxLat.radToDeg()
        ];
    }
}

function getBoundsFromLatLng(lat, lng, distance) {
    var lat_change = distance / 111.2;
    var lon_change = Math.abs(Math.cos(lat * (Math.PI / 180)));
    var bounds = [[lat - lat_change, lng - lon_change], [lat + lat_change, lng + lon_change]];
    /* {
        lat_min : lat - lat_change,
        lon_min : lng - lon_change,
        lat_max : lat + lat_change,
        lon_max : lng + lon_change
    };*/
    return bounds;
}

module.exports = {
    mapSearch: mapSearch,
    mapSearchStart: mapSearchStart,
    search: search
};
