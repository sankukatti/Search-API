'use strict';

var passport = require('passport');

module.exports = function (app) {
    /* Get controller */
    var parcelsCtrl = require('../controllers/parcels.server.controller');

    /* Get open jobs */
    app.route('/api/jobs').get(passport.authenticate('jwt', { session: false }), parcelsCtrl.isValidCarryr, parcelsCtrl.getOpenParcels);
};
