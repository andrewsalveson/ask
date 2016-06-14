var express  = require('express');
var mongoose = require('mongoose');
var fs       = require('fs');
var path     = require('path');
console.log( 'schemas controller' );
module.exports = express.Router()
  .get('/', function( req, res ){
    var p = '../models/'
    fs.readdir( p, function( err, files ){
      with( res ){
        res.json( files );
      }
    });
  })
  .get('/:schema_name', function( req, res ){
		var name = req.params.schema_name;
    var schema = require('../schemas/'+name+'.json');
    res.json( schema );
  });
