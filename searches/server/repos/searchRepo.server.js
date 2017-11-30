'use strict';

/**
 * Module dependencies.
 */
var path = require('path'),
    mongoose = require('mongoose'),
    errorHandler = require(path.resolve('./modules/core/server/controllers/errors.server.controller')),
    _ = require('lodash');

var CONF_SEARCH_FILE_BASE_PATH = '../../../../modules/';
var CONF_SEARCH_FILE_NAME = '/server/searchConfig/searchConfig';


/**
 * Search and Filter.
 * searchObject is of type Object. With properties
 * entities     - Array  - Array of entities/models need to be searched/filtered. Mongo specific model names.
 * searchFields - Object - Searchable fields per model/entity and search_key.
 * filterFields - Object - Filterable fields with specific filter_value.
 * sortFields   - Object - sortable fields with specific order.
 * page         - Number - Specifies current page number. Can be 1 to n.
 * per_page     - Number - Specifies required number of results per page.
 * models       - String - Mongoose specific model name.
 */

exports.searchAndFilter = function (searchObj) {
    return new Promise(function (resolve, reject) {
        var collectionName = searchObj.models[searchObj.entities[0]];
        var moduleName = searchObj.entities[0];
        var filterFields = searchObj.filterFields;
        var sortFields = searchObj.sortFields;
        var page = Number(searchObj.page);
        var per_page = Number(searchObj.per_page);

        /* An array of references */
        var ref = searchObj.ref;

        var searchFields = {};
        var searchString = null;

        if (_.has(searchObj.searchFields, moduleName))
            searchFields = searchObj.searchFields[moduleName];

        if (_.has(searchObj.searchFields, 'value'))
            searchString = searchObj.searchFields.value;

        searchQuery(searchString, searchFields, filterFields, sortFields, collectionName, page, per_page, ref)
            .then(function (resolved) {
                return resolve(resolved);
            }, function (rejected) {
                return reject(rejected);
            });
    });
};


exports.mapSearchAndFilter = function (searchObj) {
    return new Promise(function (resolve, reject) {
        var collectionName = searchObj.models[searchObj.entities[0]];
        var moduleName = searchObj.entities[0];
        var filterFields = searchObj.filterFields;
        var sortFields = searchObj.sortFields;
        var page = Number(searchObj.page);
        var per_page = Number(searchObj.per_page);
        var boxOnMap = searchObj.boxOnMap;
        var locationField = searchObj.locationField;

        /* An array of references */
        var ref = searchObj.ref;

        var searchFields = {};
        var searchString = null;

        if (_.has(searchObj.searchFields, moduleName)) {
            searchFields = searchObj.searchFields[moduleName];
        }

        if (_.has(searchObj.searchFields, 'value')) {
            searchString = searchObj.searchFields.value;
        }

        /* searchQuery */
        var coll = mongoose.model(collectionName);
        var query = buildQuery(searchString, searchFields, filterFields);
        var orderby = buildOrder(sortFields);
        var locQuery = locationQuery(boxOnMap, locationField);
        _.extend(query, locQuery);

        /* Its an array containing populate query objects */
        var populate = buildPopulateObject(filterFields);

        /*
         * Search config may have some default reference fields.
         * And filter objects may also have references defined on the same fields.
         * To ensure filters are given higher priority, we will first push all the default references and then will push built populate queries.
         * */
        if (populate.length > 0 && ref == null) {
            ref = [];
        }
        // return resolve(query);
        if (ref != null) {
            _.each(populate, function (obj, index) {
                ref.push(obj);
            });
        }

        /* return resolve({ query: query, orderBy: orderby, page: page, per_page: per_page, ref: ref });*/

        if (ref == null) {
            coll.find(query).sort(orderby).skip(per_page * (page - 1)).limit(per_page).lean().exec(function (err, docs) {
                if (err) {
                    return reject(err);
                } else {

                    coll.find(query).sort(orderby).count(function (err, count) {
                        if (err) {
                            return resolve({
                                'count': null,
                                'content': docs
                            });
                        } else {
                            return resolve({
                                'count': count,
                                'content': docs
                            });
                        }

                    });
                }
            });
        } else {
            coll.find(query).sort(orderby).skip(per_page * (page - 1)).limit(per_page).lean().populate(ref).exec(function (err, docs) {
                if (err) {
                    return reject(err);
                } else {

                    coll.find(query).sort(orderby).count(function (err, count) {
                        if (err) {
                            return resolve({
                                'count': null,
                                'content': docs
                            });
                        } else {
                            return resolve({
                                'count': count,
                                'content': docs
                            });
                        }

                    });
                }
            });
        }
    });
};


function locationQuery(box, loc) {
    var condition = {};
    condition[loc] = {
        '$within': {
            '$box': box
        }
    };
    return condition;
}

function searchQuery(searchString, searchFields, filterFields, sortFields, collectionName, page, per_page, ref) {

    return new Promise(function (resolve, reject) {
        /* Get the relavent collection */
        var coll = mongoose.model(collectionName);

        /* Build query */
        var query = buildQuery(searchString, searchFields, filterFields);
        var orderby = buildOrder(sortFields);

        /* Its an array containing populate query objects */
        var populate = buildPopulateObject(filterFields);

        /*
         * Search config may have some default reference fields.
         * And filter objects may also have references defined on the same fields.
         * To ensure filters are given higher priority, we will first push all the default references and then will push built populate queries.
         * */
        if (populate.length > 0 && ref == null) {
            ref = [];
        }
        // return resolve(query);
        if (ref != null) {
            _.each(populate, function (obj, index) {
                ref.push(obj);
            });
        }

        if (ref == null) {
            coll.find(query).sort(orderby).skip(per_page * (page - 1)).limit(per_page).lean().exec(function (err, docs) {
                if (err) {
                    return reject(err);
                } else {

                    coll.find(query).sort(orderby).count(function (err, count) {
                        if (err) {
                            return resolve({
                                'count': null,
                                'content': docs
                            });
                        } else {
                            return resolve({
                                'count': count,
                                'content': docs
                            });
                        }

                    });
                }
            });
        } else {

            coll.find(query).sort(orderby).skip(per_page * (page - 1)).limit(per_page).lean().populate(ref).exec(function (err, docs) {
                if (err) {
                    return reject(err);
                } else {

                    coll.find(query).sort(orderby).count(function (err, count) {
                        if (err) {
                            return resolve({
                                'count': null,
                                'content': docs
                            });
                        } else {
                            return resolve({
                                'count': count,
                                'content': docs
                            });
                        }

                    });
                }
            });
        }
    });

}


function buildQuery(search_string, searchFields, filterFields) {
    // var query = buildQueryForSearchString(search_string, searchFields);
    var query = {};
    if (search_string) {
        query.$or = Array();
        _.each(searchFields, function (type, field) {
            if (type === 'objectArray') {
                var fieldsAsArray = field.split('_');
                var objectArraySubQueryFields = {};
                objectArraySubQueryFields[fieldsAsArray[1]] = {
                    '$regex': search_string,
                    '$options': 'ixm'
                };
                var objectArrayQuery = {};
                objectArrayQuery[fieldsAsArray[0]] = {
                    '$elemMatch': objectArraySubQueryFields
                };
                query.$or.push(objectArrayQuery);
            } else {
                var condition = {};
                condition[field] = {
                    '$regex': search_string,
                    '$options': 'ix'
                };
                query.$or.push(condition);
            }
        });
    }

    _.each(filterFields, function (data, field) {

        var subQuery = Array();
        if (data.type.type === 'range') {
            query[field] = {
                '$gte': data.value.min,
                '$lte': data.value.max
            };
        } else if (data.type.type === 'string') {
            if (data.value instanceof Array) {
                subQuery = Array();
                _.each(data.value, function (key, index) {
                    subQuery.push(key);
                });
                query[field] = {
                    '$in': subQuery
                };
            } else {
                query[field] = {
                    '$regex': data.value,
                    '$options': 'i'
                };
            }
        } else if (data.type.type === 'array') {
            if (data.value instanceof Array) {
                subQuery = Array();
                _.each(data.value, function (key, index) {
                    subQuery.push({
                        '$elemMatch': {
                            '$eq': key
                        }
                    });
                });
                query[field] = {
                    '$all': subQuery
                };
            } else {

                query[field] = {
                    '$elemMatch': {
                        '$eq': data.value
                    }
                };
            }
        } else if (data.type.type === 'arrayObjectIds') {
            if (data.value instanceof Array) {
                subQuery = Array();
                _.each(data.value, function (key, index) {
                    subQuery.push(buildQueryObjectForPerformingFilteringOnObjectId(key));
                });
                query[field] = {
                    '$in': subQuery
                };
            } else {

                query[field] = {
                    '$elemMatch': {
                        '$eq': buildQueryObjectForPerformingFilteringOnObjectId(data.value)
                    }
                };
            }
        } else if (data.type.type === 'bool') {
            if (data.value === 'true') {
                query[field] = true;
            } else {
                query[field] = false;
            }

        } else if (data.type.type === 'object') {
            var fieldsAsArray = field.split('_');
            var objectArraySubQueryFields = {};

            /* Missed comment? Why we need array? */
            if (data.value instanceof Array) {
                subQuery = Array();
                _.each(data.value, function (key, index) {
                    subQuery.push(key);
                });
                objectArraySubQueryFields[fieldsAsArray[1]] = {
                    '$in': subQuery
                };
                query[fieldsAsArray[0]] = {
                    '$elemMatch': objectArraySubQueryFields
                };
            } else {

                objectArraySubQueryFields[fieldsAsArray[1]] = {
                    '$regex': data.value,
                    '$options': 'i'
                };
                query[fieldsAsArray[0]] = {
                    '$elemMatch': objectArraySubQueryFields
                };

            }

        } else if (data.type.type === 'objectId') {
            query[field] = buildQueryObjectForPerformingFilteringOnObjectId(data.value);
        }
    });
    return query;
}


function buildQueryForSearchString(search_string, searchFields) {
    var query = {};
    if (search_string) {
        query.$or = Array();
        _.each(searchFields, function (type, field) {
            // If field is an array of objects
            if (type === 'objectArray') {
                /*
                 * Split the passed field name by `-`. First part will contain the
                 * field name. Second part will contain field name inside each array element.
                 * */
                var fieldsAndSubField = field.split('_');

                /*
                 * Query for the field inside the object which is in the array.
                 * */
                var queryForObjetsInsideArray = buildQueryObjectForOneField(search_string, fieldsAndSubField[1]);

                /*
                 * Query on the main field, which is an array of objects.
                 * */
                var objectArrayQuery = {};
                objectArrayQuery[fieldsAndSubField[0]] = {
                    '$elemMatch': objectArraySubQueryFields
                };


                query.$or.push(objectArrayQuery);
            } else {
                /*
                 * Search directly on a field. String or object.
                 * */
                var condition = buildQueryObjectForOneField(search_string, field);
                query.$or.push(condition);
            }
        });
    }
    return query;
}

function buildQueryForFiltering(filterFields) {
    var query = {};

    return query;
}

function buildQueryObjectForOneField(search_string, field) {
    var query = {};
    query[field] = {
        '$regex': search_string,
        '$options': 'ix'
    };
}

function buildQueryObjectForPerformingStringRegex(search_string) {
    return {
        '$regex': search_string,
        '$options': 'i'
    };
}

function buildQueryObjectForPerformingFilteringOnRange(min, max) {
    return {
        '$gte': min,
        '$lte': max
    };
}

function buildQueryObjectForPerformingFilteringOnObjectId(id) {
    return mongoose.Types.ObjectId(id);
}

function buildPopulateObject(populatableFields) {
    var populateMatchQueryObject = {};
    var populateQueryArray = [];

    _.each(populatableFields, function (populatableField, fieldAndSubField) {

        if (populatableField.hasOwnProperty('type') && populatableField.type.type === 'refObject') {

            fieldAndSubField = fieldAndSubField.split('_');

            /* Field in the object which holds the reference */
            var path = fieldAndSubField[0];

            /* Field in the referenced object */
            var refObjectField = fieldAndSubField[1];

            /* Query on populated objects. */
            var match = {};
            if (populatableField.type.hasOwnProperty(refObjectField) && populatableField.type[refObjectField].type === 'string') {
                match[refObjectField] = buildQueryObjectForPerformingStringRegex(populatableField.value);
            }

            if (populatableField.type.hasOwnProperty(refObjectField) && populatableField.type[refObjectField].type === 'range') {
                match[refObjectField] = buildQueryObjectForPerformingFilteringOnRange(populatableField.value.min, populatableField.value.max);
            }

            if (populatableField.type.hasOwnProperty(refObjectField) && populatableField.type[refObjectField].type === 'objectId') {
                refObjectField = '_' + refObjectField;
                match[refObjectField] = buildQueryObjectForPerformingFilteringOnObjectId(populatableField.value);
            }

            /* Fields to get from the pupulated object */
            var fieldsToRetrieve = '';
            // populateQueryArray.push({path:path, match:match})
            /* console.log(path,refObjectField,match[refObjectField]);*/
            if (!populateMatchQueryObject.hasOwnProperty(path)) {
                populateMatchQueryObject[path] = {};
            }

            if (!populateMatchQueryObject[path].hasOwnProperty(refObjectField)) {
                populateMatchQueryObject[path][refObjectField] = {};
            }

            populateMatchQueryObject[path][refObjectField] = match[refObjectField];
        }
    });

    _.each(populateMatchQueryObject, function (populateMatchObject, path) {
        populateQueryArray.push({
            path: path,
            match: populateMatchObject
        });
    });

    return populateQueryArray;
}

function buildOrder(sortFields) {
    var orderby = {};
    _.each(sortFields, function (fieldDetails, index) {
        if (fieldDetails.type.type === 'object') {
            /* split and get the main object and child field */
            var fieldsArray = fieldDetails.field.split('_');
            var sortField = fieldsArray[0] + '.' + fieldsArray[1];
            orderby[sortField] = Number(fieldDetails.order);
        } else {
            orderby[fieldDetails.field] = Number(fieldDetails.order);
        }
    });

    return orderby;
}

