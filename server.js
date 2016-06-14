'use strict';

// set up ===================================================================
var express     = require('express');
var cors        = require('cors');
var app         = express();
var docs        = require("express-mongoose-docs");
var bodyParser  = require('body-parser');
var mongoose    = require('mongoose');
var port        = process.env.PORT || 8080;
var environment = process.env.NODE_ENV || 'development';
var mongoConfig = require('./config/mongo');
var morgan      = require('morgan');

// configuration ============================================================
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true}));
mongoose.connect(mongoConfig.url);
app.use(morgan('dev')); // log every request to the console

// routes ===================================================================
require('./app/routes')(app);

// docs =====================================================================
docs(app, mongoose);

// start server
console.log('starting '+environment+' server from '+__filename);
app.listen(port);
console.log('bzzzzzzzt:' + port);