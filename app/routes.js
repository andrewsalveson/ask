var express  = require('express');
var Notes    = require('./controllers/noteController');
var Schemas  = require('./controllers/schemasController');

module.exports = function (app) {
	app.use('/v1', express.Router().use( function version( req, res, next ){
		console.log( '\nProcess Lab v.1' );
		next();
	}));
  app.use('/notes', Notes);
  app.use('/schemas', Schemas);
};