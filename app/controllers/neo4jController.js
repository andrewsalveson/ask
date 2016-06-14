var express    = require('express');
var neo4j      = require('node-neo4j');
var nodeConfig = require('../../config/neo4j');
var graphDb    = new neo4j( nodeConfig.url );
var mongoose   = require('mongoose');
var Q          = require('q');
console.log( 'neo4j controller' );

function cypherSanitizeName( unsafe ){
  if(unsafe==null||typeof unsafe=="undefined") return "";
  if(typeof unsafe == "string"){
    return String(unsafe).replace(/['"\\?]/g,''); // removes escape
  }
  return "";
}
function cypherSanitize( unsafe ){
	if(unsafe==null||typeof unsafe=="undefined") return "";
	if(typeof unsafe == "string"){
		return String(unsafe).replace(/[^ \.\w?]/g,''); // returns only alphanumeric and _
	}
	return unsafe; // wtf
}

var Neo4jController = {
validateRelationship : function( rel ){
	// console.log("relationship type: "+rel.type);
	var def = "UNTYPED";
	if(typeof rel.type == "undefined" || rel.type == null){
		rel.type = def;
	}else{
		rel.type = rel.type.replace(/[^a-zA-Z?]/g,'')
	}
	if(rel.type == ""){
		rel.type = def;
	}
	return rel;
},
validateNode : function ( node ){
	var def = "UNTYPED";
	if(typeof node.type == "undefined" || node.type == null){
		node.type = def;
	}else{
		node.type = node.type.replace(/[^a-zA-Z?]/g,'');
	}
	if(node.type == ""){
		node.type = def;
	}
	if(typeof node.version == "undefined" || node.version == null){
		node.version = "0";
	}else{
    node.version = String(node.version);
		node.version = node.version.replace(/[^ \.\w?]/g,'');
	}
	return node;
},
sendQuery : function( cypherString, callback ){
  // var deferred = Q.defer();
  var deferred = Q.defer();
  if( callback ) deferred.addBack( callback );
  var cypherLog = "\n -- CYPHER --\n\n"+cypherString+"\n\n -----------";
  // console.log(cypherLog);
  graphDb.cypherQuery( cypherString, function(err, results){
    if(err){
      console.log( 'rejecting deferred promise:' );
      console.log( cypherLog );
      console.log( err );
      deferred.reject( new Error( err ) );
    }else{
      results.cypher = cypherString;
      // console.log( 'resolving deferred promise' );
      deferred.resolve( results );
    }
  });
  return deferred.promise;
},
neighborsOfId : function( unsafeid, callback ){
  var id = cypherSanitize( unsafeid );
	var cypherString = "MATCH (n)-[]-(b) "+
	  "WHERE ID(n)="+id+" "+
		"RETURN DISTINCT b as resource, labels(b) as type, b.processes as processes "+
    "ORDER BY length(b.processes) DESC";
	return Neo4jController.sendQuery( cypherString, callback );
},
neighborsOfType : function( unsafetype, callback ){
	var type = cypherSanitize( unsafetype ).toUpperCase();
  var cypherString = "MATCH (n:"+type+")-[]-(b) "+
    "RETURN DISTINCT b as resource, labels(b) as type "+
    "ORDER BY length(b.processes) DESC";
  return Neo4jController.sendQuery( cypherString, callback );
},
neighborsOfTypeName : function( unsafetype, unsafename, callback ){
	var type = cypherSanitize( unsafetype ).toUpperCase();
	var name = cypherSanitizeName( unsafename );
  var cypherString = "MATCH (n:"+type+")-[]-(b) "+
	  'WHERE n.name="'+name+'" '+
    "RETURN DISTINCT b as resource, labels(b) as type "+
    "ORDER BY length(b.processes) DESC";
  return Neo4jController.sendQuery( cypherString, callback );
},
query : function( queries, pagination, callback ){
  console.log('queries:');
  console.log( queries );
  var cypherString = "MATCH (n) WHERE ";
  var queryStrings = [];
  for(var i in queries){
    var query = cypherSanitize(queries[i]);
    for(var k in query){
      var v = query[k];
      switch(k){
        case 'type':
          v = v.replace(/[\s\-]/g,''); // remove spaces
          queryStrings.push('n:'+v+' ');
          break;
        default:
          queryStrings.push('n.'+k+' =~ "(?i).*'+v+'.*" ');
          break;
      }
    }
  }
  cypherString = cypherString + queryStrings.join(' OR ');
  cypherString = cypherString +
  "RETURN n as resource, labels(n) as type "+
  "SKIP "+pagination.offset+" LIMIT "+pagination.limit;
  return Neo4jController.sendQuery( cypherString, callback );
},
search : function( unsafesearch, callback ){
	var search = cypherSanitize(unsafesearch);
	var searchLabels = search.toUpperCase().replace(/[^\w?]/g,''); // letters only
	var cypherString = "MATCH (n) "+
		'WHERE n.name =~ "(?i).*'+search+'.*" '+
		"RETURN n as resource, labels(n) as type "+
		"UNION MATCH (n:"+searchLabels+") "+
		"RETURN n as resource, labels(n) as type;";
	return Neo4jController.sendQuery( cypherString, callback );
},
collectDocsFromRels : function( response ){
	var documents = {};
	return output;
},
collectNodes : function( response ){
	var output = [];
	var columns = response.columns;
	for(var i = 0; i < response.data.length; i++){
		var thisRow = response.data[i];
		if(Array.isArray(thisRow)){
			var thisColumns = columns.slice(1);
			var outputRow = thisRow.shift(); // use first column
			while(thisRow.length > 0){
				outputRow[thisColumns.shift()] = thisRow.shift();
			}
			output.push(outputRow);
		}else{
			output.push(thisRow);
		}
	}
	return output;
},
ensureNode : function( req ){
  
	// this does not work the same way as the other methods for this controller,
	// it needs to be thought through
	
	req = Neo4jController.validateNode( req );
	
	var findNode = Neo4jController.findNodeByTypeNameVersion( req.type, req.name, req.version );
  // console.log( 'ensuring node:' );
  // console.log( req );
  return Q.all([Q(req),findNode]).then(function(results){
    var req = results[0];
    var findNode = results[1];
    // console.log( 'findNode promise resolved' );
    if( !findNode ||
      !findNode.data ||
       findNode.data.length == 0 ){
      // console.log('resource with this name and version not found; creating index');
      var addNode = Neo4jController.addNode( req );
      return Q.all([addNode,Q(req)]).then(function(results){
        // console.log( 'addNode promise resolved' );
        var req = results[1];
        return Neo4jController.findNodeByTypeNameVersion( req.type, req.name, req.version );
      });
    }else{
      // console.log('resource found with this name and version at id '+findNode.data[0][0]._id);
      return Q(findNode);
    }
  });
},
addNode : function( params, callback ){
	for(var param in params){
    if(param=='name')
      params[param] = cypherSanitizeName( params[param] );
    else
      params[param] = cypherSanitize( params[param] );
	}
  var cypherString = "CREATE (n:"+params.type+"{"+
    "name:'"+params.name+"',"+
    "version:'"+params.version+"',";
  if(params._id)
    cypherString = cypherString+"processes:['"+params._id+"']";
  else
    cypherString = cypherString+"processes:[]";
  cypherString = cypherString+"}) RETURN n as resource, labels(n) as type";
  return Neo4jController.sendQuery( cypherString, callback );
},
clearRelationshipTags : function( unsafetag, callback ){
	var tag = cypherSanitize( unsafetag );
  // console.log(" clearing "+tag+" tags: relationships" );
  var cypherString = "MATCH ()-[r]-() "+
		"WHERE HAS(r.processes) "+
		'SET r.processes = FILTER(x IN r.processes WHERE x <> "'+tag+'");';
  return Neo4jController.sendQuery( cypherString, callback );
},
clearNodeTags : function( unsafetag, callback ){
	var tag = cypherSanitize( unsafetag );
	// console.log(" clearing "+tag+" tags: nodes");
	var cypherString = "MATCH (n) "+
		"WHERE HAS(n.processes) "+
		'set n.processes = FILTER(x IN n.processes WHERE x <> "'+tag+'");';
	return Neo4jController.sendQuery( cypherString, callback );
},
tagNode : function( id, mongoId, callback ){
  var cypherString = "MATCH (a)"+
    ' WHERE ID(a)='+id+' '+
		' SET a.processes = a.processes + "'+mongoId+'" '+
		' RETURN *';
  return Neo4jController.sendQuery( cypherString, callback );
},
tagRelationship : function( sourceId, destId, type, mongoId, callback ){
  var cypherString = "MATCH (a)-[r:"+type+"]->(b)"+
    ' WHERE ID(a)='+sourceId+' AND ID(b)='+destId+' '+
		' SET r.processes = r.processes + "'+mongoId+'" '+
		' RETURN *';
  return Neo4jController.sendQuery( cypherString, callback );
},
detachNodeByTypeNameVersion : function( unsafeType, unsafeName, unsafeVersion, callback ){
  var type = cypherSanitize( unsafeType ).toUpperCase();
  var name = cypherSanitizeName( unsafeName );
  var version = cypherSanitize( unsafeVersion );
  var cypherString = "MATCH (:"+type+" {"+
    "name:'"+name+"',version:'"+version+"'})"+
    "-[r]-() DELETE r";
  return Neo4jController.sendQuery( cypherString, callback );
},
detachNode : function(unsafeNodeId, callback){
  var nodeId = cypherSanitize( unsafeNodeId );
  var cypherString = "MATCH (a)-[r]-() WHERE ID(a)="+nodeId+
    " DELETE r";
   return Neo4jController.sendQuery( cypherString, callback );
},
addRelationship : function( unsafesourceid, unsafedestid, params, callback ){
	var sourceId = cypherSanitize( unsafesourceid );
	var destId = cypherSanitize( unsafedestid );
  console.log('adding relationship from '+sourceId+' to '+destId);
  var cypherString = "MATCH (a),(b) WHERE ID(a)="+sourceId+
    " AND ID(b)="+destId+" "+
    "CREATE (a)-[r:"+cypherSanitize(params.type)+"]->(b) ";
  if(params.mongoId){
    cypherString = cypherString+'SET r.processes = ["'+params.mongoId+'"] ';
  }
  cypherString = cypherString+"RETURN r";
  return Neo4jController.sendQuery( cypherString, callback );
},
allNodes : function( unsafelimit, callback ){
	var limit = cypherSanitize( unsafelimit );
  var cypherString = "MATCH (n) RETURN n LIMIT "+limit+";";
  return Neo4jController.sendQuery( cypherString, callback );
},
updateNodeById : function( unsafeid, params, callback ){
	var id = cypherSanitize( unsafeid );
  var cypherString = 'MATCH (n) WHERE ID(n)='+id+"\n";
  for(var unsafeparam in params){
		if( unsafeparam == 'mongoId' ){
			cypherString = cypherString + 'SET n.processes = n.processes + "'+cypherSanitize( params[param] )+'"\n';
		}else if( unsafeparam == 'name' ){
      var value = cypherSanitizeName( params[unsafeparam] );
      cypherString = cypherString + "SET n.name = '"+value+"'\n";
		}else{
			var param = cypherSanitize( unsafeparam );
			var value = cypherSanitize( params[unsafeparam] );
			cypherString = cypherString + "SET n."+param+" = '"+value+"'\n";
		}
  }
  cypherString = cypherString + 'RETURN n';
  return Neo4jController.sendQuery( cypherString, callback );

},
relsFromId : function( unsafeid, callback ){
	var id = cypherSanitize( unsafeid );
	var cypherString = 'MATCH (n)-[r]-() '+
		'WHERE ID(n)='+id+' '+
		'RETURN r as relationship, '+
		'ID(startNode(r)) as from, '+
		'type(r) as type, '+
		'ID(endNode(r)) as to '+
    // 'length(r.processes) as processes '+
    'ORDER BY length(r.processes) DESC';
	return Neo4jController.sendQuery( cypherString, callback );
},
findRelationship : function( unsafesource, unsafedest, unsafetype, callback){
	var source = cypherSanitize( unsafesource );
	var dest = cypherSanitize( unsafedest );
	var type = cypherSanitize( unsafetype );
  var cypherString = 'MATCH (a)-[r:'+type+']-(b) '+
    'WHERE ID(a)='+source+' AND '+
          'ID(b)='+dest+' '+
    'RETURN r';
  return Neo4jController.sendQuery( cypherString, callback );
},
findNodesByProcessId : function( unsafeid, callback ){
	var id = cypherSanitize( unsafeid );
  var cypherString = "MATCH ()-[r]-() "+
    "WHERE r.m_"+id+"=true RETURN *";
  return Neo4jController.sendQuery( cypherString, callback );
},
findNodeByTypeNameVersion : function( unsafetype, unsafename, unsafeversion, callback ){
  var type = cypherSanitize( unsafetype ).toUpperCase();
	var name = cypherSanitizeName( unsafename );
	var version = cypherSanitize( unsafeversion );
	var cypherString = "MATCH (n:"+type+" {"+
    "name:'"+name+"',version:'"+version+"'}) "+
		"RETURN n as resource, labels(n) as type;";
  return Neo4jController.sendQuery( cypherString, callback );
},
findNodeByTypeAndParameter : function( unsafetype, unsafeparameter, unsafevalue, callback ){
  var type = cypherSanitize( unsafetype ).toUpperCase();
  var parameter = cypherSanitize( unsafeparameter );
  var value = cypherSanitize( unsafevalue );
	var cypherString = "MATCH (n:"+type+" {"+
    parameter+":'"+value+"'}) "+
    "RETURN n as resource, labels(n) as type;";
  return Neo4jController.sendQuery( cypherString, callback );
},
findNodeByParameter : function( unsafeparameter, unsafevalue, callback ){
	var parameter = cypherSanitize( unsafeparameter );
	var value = cypherSanitize( unsafevalue );
  var cypherString = "MATCH (n {"+parameter+":'"+value+"'}) "+
    "RETURN n as resource, labels(n) as type;";
  return Neo4jController.sendQuery( cypherString, callback );
},
findNodeByType : function( unsafetype, callback ){
	var type = cypherSanitize( unsafetype ).toUpperCase();
  var cypherString = "MATCH (n:"+type+") "+
    "RETURN n as resource, labels(n) as type;";
  return Neo4jController.sendQuery( cypherString, callback );
},
findNodeByTypeAndName : function( unsafetype, unsafename, callback ){
	var type = cypherSanitize( unsafetype ).toUpperCase();
	var name = cypherSanitizeName( unsafename );
  return Neo4jController.findNodeByTypeAndParameter( type, 'name', name, callback );
},
findNodeById : function( unsafeid, callback ){
	var id = cypherSanitize( unsafeid );
  if(isNaN(parseInt(id))){
    var deferred = Q.defer();
    console.log('bad id');
    deferred.reject('bad id');
    return deferred.promise;
  }
  var cypherString = 'MATCH (n) WHERE ID(n)='+id+
	' RETURN n as resource, labels(n) as type';
  return Neo4jController.sendQuery( cypherString, callback );
},
deleteNodeById : function( unsafeid, callback ){
	var id = cypherSanitize( unsafeid );
  var cypherString =
    "MATCH (n) where ID(n)="+id+" "+
    "OPTIONAL MATCH (n)-[r]-()"+
    "DELETE r,n";
  return Neo4jController.sendQuery( cypherString, callback );
}
}
module.exports = Neo4jController;
