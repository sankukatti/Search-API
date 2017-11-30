'use strict';

/**
 * Module dependencies.
 */
var path = require('path'),
    mongoose = require('mongoose'),
    async = require('async'),
    nodemailer = require('nodemailer'),
    config = require(path.resolve('./config/config')),
    errorHandler = require(path.resolve('./modules/core/server/controllers/errors.server.controller')),
    _ = require('lodash');

var CONF_SEARCH_FILE_BASE_PATH = '../../../../modules/';
var CONF_SEARCH_FILE_NAME = '/server/searchConfig/searchConfig';

var searchRepos = require('../repos/searchRepo.server');

/*
 * Search and filter.
 *
 * searchString      String      Holds search string.
 *
 * filters           Object      Holds filters as objects.
 *                               Type - {field_name - field_value}
 *                               If type is range -
 *                               {field_name - {min : min_value, max : max_value}}
 *
 * sortFields        Array       Array of sort fields and respective order.
 *                               Type - [{'field' : filed_name, 'order', 'sort_order'}]
 *
 * entities          Array       An array of entity names. For cross model search.
 *                               Current implementation is for search/filter in one module.
 *
 * page              Number      Specifies current page number. Can be 1 to n.
 *
 * per_page          Number      Specifies required number of results per page.
 *
 * */
exports.search = function (searchString, filters, sortFields, entities, page, per_page) {


    /*
     * searchableFields is of type Object.
     *This will hold all the searchable fields as specified in the module's search config.
     * Each module specified in the entities will be a property in this object.
     * Each module's searchable field will be a property in searchableFields.[model] Object.
     * It will also hold a property named `value` which holds the searchString.
     * */
    var searchableFields = {};

    /*
     * filterableFields is of type Object.
     * Each module specified in the entities will be a property in this object.
     * Each module's filterable fields will be a property in filterableFields.[model] Object.
     * */
    var filterableFields = {};

    /*
     * sortableFields is of type Object.
     * Each module specified in the entities will be a property in this object.
     * Each module's sortable fields will be a property in sortableFields.[model] Object.
     *
     * */
    var sortableFields = {};

    /*
     * models is of type Object.
     * Each entry is the module's name with respect to Mongoose.
     * */
    var models = {};

    /*
    * ref is of type array of strings.
    * Each string is a field name which refers a document of another collection
    * */
    var ref = null;

    var errors = Array();


    return new Promise(function (resolve, reject) {

        if (sortFields instanceof Array) {
            //
        } else {
            errors.push('Error - SortFields format should be an Array');
        }

        if (filters instanceof Object) {
            //
        } else {
            errors.push('Error - filters should be an Object');
        }

        if (errors.length > 0) {
            return reject(errors);
        }

        /* Set search string to null if its value is not in the required format */
        if (searchString == null || searchString === '' || !searchString) {
            searchString = null;
        }

        /* Add search value to searchableFields */
        if (searchString != null && searchString.length > 0) {
            searchableFields['value'] = searchString;
        }

        /* per_page limitation */
        if (Number(per_page) > 50) {
            per_page = '50'; // maximum limitation of records per page
        }

        /* If page is not set then setting page and per_page to zero to handle mongo invalid skip value error. This is to make sure that there will be no invalid values while doing mongo query.*/
        if (page == null || page.length <= 0) {
            page = 1;
            per_page = 0;
        }


        /* Validate whether search config has all the required fields.
         Require config file once in the start of the function.
         */

        _.each(entities, function (entity, index) {

            searchableFields[entity] =
                require(CONF_SEARCH_FILE_BASE_PATH + entity + CONF_SEARCH_FILE_NAME).SearchConfig.searchFields;

            filterableFields[entity] =
                require(CONF_SEARCH_FILE_BASE_PATH + entity + CONF_SEARCH_FILE_NAME).SearchConfig.filterFields;

            sortableFields[entity] =
                require(CONF_SEARCH_FILE_BASE_PATH + entity + CONF_SEARCH_FILE_NAME).SearchConfig.sortFields;

            models[entity] =
                require(CONF_SEARCH_FILE_BASE_PATH + entity + CONF_SEARCH_FILE_NAME).SearchConfig.modules[0];

            ref = require(CONF_SEARCH_FILE_BASE_PATH + entity + CONF_SEARCH_FILE_NAME).SearchConfig.ref;
        });

        /* Each module's search config should provide mongoose specific model name*/
        if (Object.keys(models).length <= 0) {
            errors.push('Search config file should have a valid model name');
        } else {
            _.each(models, function (model, index) {
                if (!model || model.length <= 0) {
                    errors.push('Model name ' + model + ' is invalid for ' + entities[index]);
                }
            });
        }

        /* Validate sortable fields against module's searchConf and user provided sortable fields.*/
        _.each(sortFields, function (sortItem, index) {
            _.forOwn(sortableFields, function (sortConf, entityName) {
                if (_.has(sortConf, sortItem.field)) {

                    if (sortItem.order !== 1 && sortItem.order !== -1) {
                        errors.push(sortItem.field + 'Sort order value can be 1 or -1');
                    }
                } else {
                    errors.push(entityName + 'does not list ' + sortItem.field + ' field as sortable');
                }
            });
        });

        var selectedFilters = {};
        /* Validate filterable fields against module's searchConf and user provided filterable fields.*/
        _.forOwn(filters, function (value, key) {
            _.forOwn(filterableFields, function (filterConf, entityName) {
                if (_.has(filterConf, key)) {

                    selectedFilters[key] = {
                        'type': filterConf[key],
                        'value': value
                    };

                } else {
                    errors.push(entityName + 'does not list ' + key + ' field as filterable');
                }
            });
        });

        if (errors.length > 0) // Reject with errors
            return reject(errors);
        else {

            var searchObj = {};
            searchObj.entities = entities;

            if (searchString != null && searchString.length > 0) {
                searchObj.searchFields = searchableFields;
            }

            searchObj.filterFields = selectedFilters;
            searchObj.sortFields = sortFields;
            searchObj.page = page;
            searchObj.per_page = per_page;
            searchObj.models = models;
            if (ref && ref.length > 0) {
                searchObj.ref = ref;
            } else {
                searchObj.ref = null;
            }

            // Handle else condition
            if (searchObj) {
                searchRepos.searchAndFilter(searchObj)
                .then(function (resolved) {
                    return resolve(resolved);
                }, function (rejected) {
                    return reject(rejected);
                });
            }
        }
    });
};


exports.locationSearch = function (searchString, filters, sortFields, entities, bound, page, per_page) {

    var searchFields = {};
    var filterFields = {};
    var sortableFields = {};
    var models = {};
    var ref = null;
    var locationField = null;
    var errors = new Array();

    return new Promise(function (resolve, reject) {

        /* var area = {
         a : {
         x : Number( bound['lon1'] ), y : Number( bound['lat1'] )
         },
         b : {
         x : Number( bound['lon1'] ), y : Number( bound['lat2'] )
         },
         c : {
         x : Number( bound['lon2'] ), y : Number( bound['lat2'] )
         },
         d : {
         x : Number( bound['lon2'] ), y : Number( bound['lat1'] )
         }
         };*/

        var boxOnMap = [
            [
                Number(bound['lon1']),
                Number(bound['lat1'])
            ],
            [
                Number(bound['lon2']),
                Number(bound['lat2'])
            ]
        ];

        if (sortFields instanceof Array) {
            //
        } else {
            errors.push('Error - SortFields format should be an Array');
        }

        if (filters instanceof Object) {
            //
        } else {
            errors.push('Error - filters should be an Object');
        }

        if (errors.length > 0) {
            return reject(errors);
        }

        /* Set search string to null if its value is not in the required format */
        if (searchString == null || searchString === '' || !searchString) {
            searchString = null;
        }

        /* Add search value to searchableFields */
        if (searchString != null && searchString.length > 0) {
            searchFields['value'] = searchString;
        }

        /* per_page limitation */
        if (Number(per_page) > 50) {
            per_page = '50'; // maximum limitation of records per page
        }

        /* If page is not set then setting page and per_page to zero to handle mongo invalid skip value error. This is to make sure that there will be no invalid values while doing mongo query.*/
        if (page == null || page.length <= 0) {
            page = 1;
            per_page = 50;
        }

        /* if( per_page == "" ) {
         per_page = 9;
         }

         if( page == "") {
         page = 1;
         }*/

        _.each(entities, function (entity, index) {
            searchFields[entity] = require(CONF_SEARCH_FILE_BASE_PATH + entity + CONF_SEARCH_FILE_NAME).SearchConfig.searchFields;

            filterFields[entity] = require(CONF_SEARCH_FILE_BASE_PATH + entity + CONF_SEARCH_FILE_NAME).SearchConfig.filterFields;

            sortableFields[entity] = require(CONF_SEARCH_FILE_BASE_PATH + entity + CONF_SEARCH_FILE_NAME).SearchConfig.sortFields;

            models[entity] = require(CONF_SEARCH_FILE_BASE_PATH + entity + CONF_SEARCH_FILE_NAME).SearchConfig.modules[0];

            ref = require(CONF_SEARCH_FILE_BASE_PATH + entity + CONF_SEARCH_FILE_NAME).SearchConfig.ref;

            locationField = require(CONF_SEARCH_FILE_BASE_PATH + entity + CONF_SEARCH_FILE_NAME).SearchConfig.locationField;
        });

        if (locationField === null) {
            errors.push('Please configure locationField to do map search');
        }

        if (Object.keys(models).length <= 0) {
            errors.push('Search config file should have a valid model name');
        } else {
            _.each(models, function (model, index) {
                if (!model || model.length <= 0) {
                    errors.push('Model name `' + model + '` is invalid for ' + entities[index]);
                }
            });
        }

        _.each(sortFields, function (sortItem, index) {
            _.forOwn(sortableFields, function (sortConf, entityName) {
                if (_.has(sortConf, sortItem.field)) {
                    //
                    if (Number(sortItem.order) !== 1 && Number(sortItem.order) !== -1) {
                        errors.push(sortItem.field + ' Sort order value can be 1 or -1');
                    } else {
                        sortItem.type = sortConf[sortItem.field];
                    }
                } else {
                    errors.push(entityName + 'does not list `' + sortItem.field + '` field as sortable');
                }
            });
        });

        var selectedFilters = {};
        _.forOwn(filters, function (value, key) {
            _.forOwn(filterFields, function (filterConf, entityName) {

                if (_.has(filterConf, key)) {

                    selectedFilters[key] = {
                        'type': filterConf[key],
                        'value': value
                    };

                } else {
                    errors.push(entityName + ' does not list `' + key + '` field as filterable');
                }
            });
        });

        if (errors.length > 0) // Reject with errors
            return reject(errors);
        else {

            var searchObj = {};
            searchObj.entities = entities;

            if (searchString !== null && searchString.length > 0) {
                searchObj.searchFields = searchFields;
            }

            searchObj.filterFields = selectedFilters;
            searchObj.sortFields = sortFields;
            searchObj.page = page;
            searchObj.per_page = per_page;
            searchObj.boxOnMap = boxOnMap;
            searchObj.locationField = locationField;
            searchObj.models = models;
            if (ref && ref.length > 0) {
                searchObj.ref = ref;
            } else {
                ref = null;
            }

            if (searchObj) {
                searchRepos.mapSearchAndFilter(searchObj)
                    .then(function (resolved) {
                        return resolve(resolved);
                    }, function (rejected) {
                        return reject(rejected);
                    });
            }
        }
    });
};
