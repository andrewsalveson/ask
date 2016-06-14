var express = require('express');
var soundex = require('soundex');
var fs      = require('fs');
var Q       = require('q');
var Neo4j   = require('./neo4jController');

function ensureProcess(id,proc){
  console.log('ensuring process '+id+' exists');
  var ProcessModel = loadCollectionModel('process');
  if(!id.match(/[0-9a-f]{24}/)){ // check if the id looks like a Mongo ID
    console.log('this does not look like an existing Process; creating');
    var newProcess = new ProcessModel({
      name: proc.name,
      instances: {},
      resources: {},
      relationships: []
    });
    var nid = Q.defer();
    var p = newProcess.save(function(err, newProc){
      if(err)return console.log('error saving process',newProc,err);
      nid.resolve(newProc);
    });
    return nid.promise;
  }else{ // looks like a Mongo ID
    return ProcessModel.findById(id,function(err, found){
      if(err)return console.log('error searching for process',found,err);
      console.log('process found',found);
      return found;
    }).exec();
  }
}
function loadCollectionModel( collection, req, res ){
  // this should use a more functional paradigm
  // need to find another way to do this -- fs.exists() is deprecated!
  // console.log( 'attempting to load collection "'+collection+'" model . . . ' );
  // if(!fs.existsSync('../models/'+collection+'.js')){
		// console.log('from '+__dirname);
		// console.log('../models/'+collection+' appears to not exist');
    // res.send( collection+' model does not exist' );
		// return false;
  // }
  return require('../models/'+collection);
}
function cypherSanitize( unsafe ){
	if(!unsafe) return "";
	if(typeof unsafe == "string"){
		return String(unsafe).replace(/[^ \.\w?]/g,''); // returns only alphanumeric and _
	}
	return unsafe;
}
function nodesFromProcessRequest( req, res ){
	return nodesFromResources( req, res, req.body.resources);
}
function unpackPromises(){
  
}
function nodesFromResources( req, res, resources ){
  var resourcePromises = [];
  var subProcesses = [];
  var keys = [];
	for(var r in resources){
    keys.push(r);
		var resource = resources[r];
    if(resource.type==='PROCESS'){
      console.log('resource '+resource.name+' is a PROCESS');
      var sureProcess = ensureProcess(resource.version,resource);
      subProcesses.push(sureProcess);
    }else{
      subProcesses.push(Q(false));
    }
		resource = Neo4j.validateNode(resource);
    // console.log("node validated for Neo4j; storing:");
    // console.log(resource);
		resourcePromises.push(resource); // original request for comparison
		resourcePromises.push(Neo4j.ensureNode(resource)); // ensured request with Neo4j ID
	}
  // promises.push(Q(subProcesses));
  return [
    Q(req),
    Q(res),
    Q(keys),
    Q.all(resourcePromises),
    Q.all(subProcesses)
  ];
}
function resourcesFromNodes( results ){
	var resources = [];
	while(results.length > 1){ // last item is keys
		var original = Neo4j.validateNode( results.shift() );
    var nodes = results.shift();
		var result = nodes.data[0][0];
		// console.log('resourcesFromNodes: retrieving result');
		// console.log( result );
		original.neo4jId = result._id;
    if(original._id)
      delete original._id; // must delete _id: it conflicts with Mongoose
		resources.push(original);
	}
	return resources;
}
function checkLibrary( process ){
  var map = {};
  var rewrite = {};
  for(var r in process.resources){
    var resource = process.resources[r];
    if(!map.hasOwnProperty(resource.type)){
      map[resource.type] = {};
      map[resource.type][resource.name] = {};
      map[resource.type][resource.name][resource.version] = r;
      continue;
    }
    if(!map[resource.type].hasOwnProperty(resource.name)){
      map[resource.type][resource.name] = [resource.version];
      continue;
    }
    if(map[resource.type][resource.name].hasOwnProperty(resource.version)){
      console.log('library contains duplicate '+resource.type+' '+resource.name+' v '+resource.version);
      rewrite[r] = map[resource.type][resource.name][resource.version];
      continue;
    }
    map[resource.type][resource.name][resource.version] = r;
  }
  for(var r in rewrite){
    delete process.resources[r];
    for(var i in process.instances){
    var instance = process.instances[i];
      var to = rewrite[r];
      var old = instance.resource;
      if(r==old){
        console.log('re-mapping instance '+i+' resource from '+old+' to '+to);
        process.instances[i].resource = to;
      }
    }
  }
  return process;
}
function checkProcess( process ){
  // console.log('validating process . . .');
  var properties = ['instances','resources','relationships']; 
  for(var p in properties){
    if(!process.hasOwnProperty(properties[p]))
      throw "no property '"+properties[p]+"'";
  }
  for(var i in process.instances){
    // check all instances to ensure they refer to valid resources
    if(!process.instances[i].resource)
      throw "instance "+i+" has no resource";
    var resource = process.instances[i].resource;
    if(!process.resources.hasOwnProperty(resource))
      throw "instance resource "+resource+" does not exist";
  }
  for(var r in process.relationships){
    // check all relationships to ensure they refer to valid instances
    var relationship = process.relationships[r];
    var source = relationship.source;
    var destination = relationship.destination;
    if(!process.instances.hasOwnProperty(source))
      throw "relationship source instance "+source+" does not exist";
    if(!process.instances.hasOwnProperty(destination))
      throw "relationship destination instance "+destination+" does not exist";
  }
  // console.log('. . . basic process structure valid');
  // console.log('checking library structure . . .');
  process = checkLibrary( process );
  // console.log('. . . library checked');
  return process;
}

module.exports = express.Router()
  .get('/:collection', function (req, res) {
    var CollectionModel = loadCollectionModel( req.params.collection, req, res );
    CollectionModel.find(function (err, processes) {
      if (err) res.send(err);
      res.json(processes);
    });
  })
	.post('/process', function(req, res){
    try{
      // checkProcess throws error on validation failure
      req.body = checkProcess( req.body );
    }catch(err){
      console.log(err);
      res.status(400).send("FAILURE: validation error - "+err);
      return;
    }
    // pack reqest, response, and nodes as promises
		var promises = nodesFromProcessRequest( req, res );
		// console.log('process pre-mongoose promises created');
		Q.all(promises).then(function(results){
			// console.log('process pre-mongoose promises resolved');
      
      // unpack request, response, and data
			var req = results.shift();
			var res = results.shift();
      var keys = results.pop();
      var subProcesses = results.pop();
      var resources = resourcesFromNodes( results );
      for(var r in results){
        req.body.resources[keys[r]] = resources[r];
      }
			var CollectionModel = loadCollectionModel('process',req,res);
			var collectionInstance = new CollectionModel( req.body );
			collectionInstance.save(function(err){
				if(err)res.send(err);
				res.json(collectionInstance);
			});
		}).catch(function(error){
      console.log(error);
			console.log("bad request");
			res.status(400).send("bad request: "+error);
		});
	})
  .post('/resource',  function (req, res) {
    var self = this;
    var promises = nodesFromResources( req, res, [req.body] );
    console.log( 'resource pre-mongoose promise created' );
    Q.all(promises).then(function(results){
      var req = results.shift();
      var res = results.shift();
      var keys = results.shift();
      var resources = results.shift();
      // console.log("retrieving resources from Neo4j nodes");
			var resource = resourcesFromNodes( resources )[0]; // unpack, grab 1st
      // console.log("resources retrieved from nodes:");
      // console.log(resource);
      var CollectionModel = loadCollectionModel( 'resource', req, res );
      var collectionInstance = new CollectionModel( resource );
      collectionInstance.save(function(err) {
        if (err) res.send(err);
        res.json( collectionInstance );
      });      
    }).catch(function(error){
			console.log("bad request");
      console.log(error);
			res.status(400).send("bad request");
		});
  })
  .get('/:collection/:resource',function(req, res) {
    var CollectionModel = loadCollectionModel( req.params.collection, req, res );
    CollectionModel.findById(req.params.resource, function(err, process) {
      if (err) res.send(err);
      res.json(process);
    });
  })
  .put('/process/:resource',function(req, res){
		var self = this;
    try{
      req.body = checkProcess( req.body );
    }catch(err){
      console.log(err);
      res.status(400).send("FAILURE: validation error - "+err);
      return;
    }
		var promises = nodesFromProcessRequest( req, res );
		// console.log('process pre-mongoose promises created');
		Q.all(promises).then(function(results){
			// console.log('process pre-mongoose promises resolved');
      
      // unpack array of resolved promises
			var req  = results.shift();
			var res  = results.shift();
      var keys = results.shift();
      var ensuredResources = results.shift();
      var subProcesses     = results.shift();
      
      // add ensured resources to the process
      var resources = resourcesFromNodes( ensuredResources );
      for(var r in ensuredResources){
        req.body.resources[keys[r]] = resources[r];
      }
      
      // add ensured subprocesses to the process
      // console.log(subProcesses);
      for(var s in subProcesses){
        var sub = subProcesses[s];
        console.log(keys[s],':',sub);
        if(sub){
          var subres = keys[s];
          req.body.resources[subres].version = sub._id;
          console.log('subprocess',subres,'version = Mongo ID',sub._id);
        }
      }
      
			// req.body.resources = resourcesFromNodes( results );
			// console.log(req.body);
			var CollectionModel = loadCollectionModel('process',req,res);
			CollectionModel.findById(req.params.resource, function(err, resource ) {
				if (err) res.send(err);
				for(var param in req.body){
					resource[param] = req.body[param];
				}
				resource.save(function(err) {
					if (err) res.send(err);
					res.json({ resource: resource });
				});
			});
		}).catch(function(error){
			console.log("bad request");
      console.log(error);
			res.status(400).send("bad request");
		});
	})
  .get('/:collection/:resource/params',function(req,res){
    var ProcessModel = loadCollectionModel(req.params.collection,req,res);
    ProcessModel.findById(req.params.resource,function(err,process){
      if(err||!process||process==null)return res.send(err);
      return res.send(Object.keys(process._doc));
    });
  })
  .get('/:collection/:resource/params/:name',function(req,res){
    var ProcessModel = loadCollectionModel(req.params.collection,req,res);
    ProcessModel.findById(req.params.resource,function(err,process){
      if(err||!process||process==null)return res.send(err);
      if(!process[req.params.name])return res.send(null);
      return res.send(process[req.params.name]);
    });
  })
	.get('/process/:resource/related',function(req, res){
    var ProcessModel = loadCollectionModel('process',req,res);
    var promises = [Q(req),Q(res)];
    ProcessModel.findById(req.params.resource,function(err,process){
      if(err||!process||process==null)return res.send(err);
      if(!process.resources){
        return res.send('no resources');
      }
      for(var r in process.resources){
        var resource = process.resources[r];
        promises.push(Neo4j.neighborsOfId(resource.neo4jId));
      }
      console.log('resolving promises . . .');
      Q.all(promises).then(function(results){
        var req = results.shift();
        var res = results.shift();
        var related = {};
        var result = results.shift();
        console.log(result);
        var column = 2;
        for(var d in result.data){
          var row = result.data[d];
          for(var p in row[column]){
            var proc = row[column][p];
            if(!related[proc]){
              related[proc]={
                score:0
              }
            }
            related[proc].score++;
          }
        }
        res.json(related);
      }).catch(function(err){
        res.json(err);
      });
    });
  })
  .put('/:collection/:resource', function(req, res) {
		req.params.resource = validateNode( req.params.resource );
    var CollectionModel = loadCollectionModel( req.params.collection, req, res );
    CollectionModel.findById(req.params.resource, function(err, resource ) {
      if (err) res.send(err);
      for(var param in req.body){
        resource[param] = req.body[param];
      }
      resource.save(function(err) {
        if (err) res.send(err);
        res.json({ resource: resource });
      });
    });
  })
  .delete('/:collection/:resource', function(req, res) {
    var CollectionModel = loadCollectionModel( req.params.collection, req, res );
		var mongoId = req.params.resource;
    CollectionModel.remove({
      _id: mongoId
    }, function(err, deleted) {
      if (err) res.send(err);
			Neo4j.clearNodeTags( mongoId );
			Neo4j.clearRelationshipTags( mongoId );
      res.json({ message: 'Successfully deleted' });
    });
  });
