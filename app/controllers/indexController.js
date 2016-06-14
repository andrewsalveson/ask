var express  = require('express');
var Q        = require('q');
var Neo4j    = require('./neo4jController');
var search   = require('../models/search');
console.log( 'index controller' );

function cypherSanitize( unsafe ){
	return unsafe.replace(/[^ \.\w?]/g,'')
}

module.exports = express.Router()
  .get('/',function( req, res ){
		res.json( 'index root' );
	})
	.get('/neighbors_of_process/',function(req,res){
		
	})
	.get('/:id/relationships',function(req,res){
		var id = req.params.id;
		Neo4j.relsFromId( id ).then(function(nodes){
			res.json( nodes );
		});
	})
	.get('/:id/neighbors',function( req, res ){
		var id = req.params.id;
		Neo4j.neighborsOfId( id ).then(function( nodes ){
			res.json( nodes );
		});
	})
	.get('/neighbors/:type',function(req,res){
		var type = req.params.type;
		Neo4j.neighborsOfType( type ).then(function(nodes){
			res.json( nodes );
		});
	})
	.get('/neighbors/:type/:name',function( req, res ){
		var type = req.params.type;
		var name = req.params.name;
		Neo4j.neighborsOfTypeName( type, name ).then(function(nodes){
			res.json( nodes );
		});
	})
	.get('/:id',function(req,res){
		var id = req.params.id;
		Neo4j.findNodeById(id).then(function( nodes ){
			res.json(nodes);
		}).catch(function(err){
      res.status(400).send(err);
    });
	})
	.get('/search/:search',function( req, res ){
		// var searchString = req.params.search;
		var queries = search.buildQueries( req.params.search );
    var pagination = search.buildPagination( req.query );
		// Neo4j.search( searchString ).then(function(nodes){
		Neo4j.query( queries, pagination ).then(function(nodes){
			res.json( nodes );
		});
	})
	.get('/node/:type', function( req, res ){
		var type = req.params.type;
		Neo4j.findNodeByType( type ).then(function(nodes){
			res.json( nodes );
		});
	})
	.get('/node/:type/:name',function(req, res){
		var type = req.params.type;
		var name = req.params.name;
		Neo4j.findNodeByTypeAndName( type, name ).then(function(nodes){
			res.json( nodes );
		});
	})
  .get('/node/:type/:name/:version', function( req, res ){
		var type = req.params.type;
		var name = req.params.name;
		var version = req.params.version;
		Neo4j.findNodeByTypeNameVersion( type, name, version ).then(function( nodes ){
			res.json( nodes );
		});
  });