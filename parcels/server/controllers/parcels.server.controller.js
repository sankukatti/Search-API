'use strict';

/**
 * Module dependencies
 */
var path = require('path');
var errorHandler = require(path.resolve('./modules/core/server/controllers/errors.server.controller'));
var carryrServices = require(path.resolve('./modules/carryrs/server/services/carryr.server.service'));
var customerServices = require(path.resolve('./modules/customers/server/services/customer.server.service'));
var parcelServices = require(path.resolve('./modules/parcels/server/services/parcels.server.service'));

exports.getOpenParcels = function (req, res) {

    req.query.parcelStatus = 'booked';
    var radius = 15;
    if (req.query.hasOwnProperty('radius')) {
        radius = req.query.radius;
        delete req.query.radius;
    }

    parcelServices.getOpenParcels(req, radius)
    .then(function (success) {
        res.jsonp(success);
    }, function (error) {
        res.status(400).send(error);
    });
};

/*
 * Is valid customer?
 * */
exports.isValidCustomer = function (req, res, next) {

    if (customerServices.isValidCustomer(req.user)) {
        next();
    } else {
        res.status(errorHandler.getErrorStatus({ code: 'UNAUTHORIZED' })).send(errorHandler.getErrorMessage({ code: 'UNAUTHORIZED' }));
    }
};

/*
 * Is valid customer?
 * */
exports.isValidCarryr = function (req, res, next) {
    if (carryrServices.isValidCarryr(req.user)) {
        next();
    } else {
        res.status(errorHandler.getErrorStatus({ code: 'UNAUTHORIZED' })).send(errorHandler.getErrorMessage({ code: 'UNAUTHORIZED' }));
    }
};
