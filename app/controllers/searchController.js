var express  = require('express');
var soundex  = require('soundex');
var fs       = require('fs');
var Q        = require('q');
var search   = require('../models/search');
console.log( 'search controller' );
function loadCollectionModel( collection, req, res ){
  if(!fs.existsSync(__dirname+'/../models/'+collection+'.js')){
    res.send( collection+' model does not exist' );
  }
  return require('../models/'+collection);
}
module.exports = express.Router()
  .post('/:collection/:search',function( req, res ){
    // complex query object stored in POST data
    var pagination = search.buildPagination( req.query );
  })
  .get('/:collection/:search', function( req, res ){
    var CollectionModel = loadCollectionModel( req.params.collection, req, res );
    var pagination = search.buildPagination( req.query );
    var queries = search.buildQueries( req.params.search );
    Q.all( search.buildCalls( CollectionModel, queries ) )
    .then(function( searchResults ){
      var counts = search.countsFromResults( searchResults );
      var results = [];
      for(var c in counts){
        results.push( counts[c].result );
      }
      if( results.length < pagination.offset + 1 ){
        res.json( [] );
      }else if( results.length < pagination.offset + pagination.limit ){
        res.json( results.slice( pagination.offset, results.length ) );;
      }else{
        res.json( results.slice( pagination.offset, pagination.offset + pagination.limit ) );
      }
    });
  });