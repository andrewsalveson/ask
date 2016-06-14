var express   = require('express');
var soundex   = require('soundex');
var NoteModel = require('../models/note');
var fs        = require('fs');
var Q         = require('q');
var Neo4j     = require('./neo4jController');
var nlp       = require('nlp_compromise');

function ensureNote(id,proc){
  console.log('ensuring note '+id+' exists');
  var NoteModel = loadCollectionModel('note');
  if(!id.match(/[0-9a-f]{24}/)){ // check if the id looks like a Mongo ID
    console.log('this does not look like an existing Note; creating');
    var newNote = new NoteModel({
      name: proc.name,
      instances: {},
      keywords: {},
      relationships: []
    });
    var nid = Q.defer();
    var p = newNote.save(function(err, newProc){
      if(err)return console.log('error saving note',newProc,err);
      nid.resolve(newProc);
    });
    return nid.promise;
  }else{ // looks like a Mongo ID
    return NoteModel.findById(id,function(err, found){
      if(err)return console.log('error searching for note',found,err);
      console.log('note found',found);
      return found;
    }).exec();
  }
}
function cypherSanitize( unsafe ){
	if(!unsafe) return "";
	if(typeof unsafe == "string"){
		return String(unsafe).replace(/[^ \.\w?]/g,''); // returns only alphanumeric and _
	}
	return unsafe;
}
function keywordsFromNoteRequest( req, res ){
  console.log(req.body);
	return keywordsFromBody( req, res, req.body.root);
}
function unpackPromises(){
  
}
function keywordsFromBody( req, res, body ){
  var topics = [];
  var terms = nlp.text(body).terms();
  // try{
    // topics = nlp.text(body).topics();
  // }catch(err){
    // console.log(err);
  // }
  // console.log('topics:',topics);
  var keywords = [];
  
  
	for(var t in topics){
    keywords.push({
      name: topics[t].text,
      type: 'TOPIC',
      version: 1
    });
  }
  for(var t in terms){
    keywords.push({
      name: terms[t].normal,
      type: 'TERM',
      version: 1
    });
  }
  var keywordPromises = [];
  for(var k in keywords){
    var keyword = keywords[k];
		validKeyword = Neo4j.validateNode(keyword);
    // console.log("node validated for Neo4j; storing:");
    // console.log(validKeyword);
		keywordPromises.push(validKeyword); // original request for comparison
		keywordPromises.push(Neo4j.ensureNode(validKeyword)); // ensured request with Neo4j ID
	}
  // promises.push(Q(subNotees));
  return [
    Q(req),
    Q(res),
    Q.all(keywordPromises)
  ];
}
function keywordsFromNodes( results ){
	var keywords = [];
	while(results.length > 1){ // last item is keys
		var original = Neo4j.validateNode( results.shift() );
    var nodes = results.shift();
		var result = nodes.data[0][0];
		// console.log('notesFromNodes: retrieving result');
		// console.log( result );
		original.neo4jId = result._id;
    if(original._id)
      delete original._id; // must delete _id: it conflicts with Mongoose
		keywords.push(original);
	}
	return keywords;
}

module.exports = express.Router()
  .get('/', function (req, res) {
    NoteModel.find(function (err, notes) {
      if (err) res.send(err);
      var ids = [];
      for(n in notes){
        ids.push(notes[n]._id);
      }
      res.json(ids);
    });
  })
	.post('/', function(req, res){
    // pack reqest, response, and nodes as promises
    req.body.root = nlp.text(req.body.body).root();
		var promises = keywordsFromNoteRequest( req, res );
		// console.log('note pre-mongoose promises created');
		Q.all(promises).then(function(results){
			// console.log('note pre-mongoose promises resolved');
      
      // unpack request, response, and data
			var req = results.shift();
			var res = results.shift();
      req.body.keywords = keywordsFromNodes( results );

			var noteInstance = new NoteModel( req.body );
			noteInstance.save(function(err){
				if(err)res.send(err);
				res.json(noteInstance);
			});
		}).catch(function(error){
      console.log(error);
			console.log("bad request");
			res.status(400).send("bad request: "+error);
		});
	})
  .get('/:resource',function(req, res) {
    NoteModel.findById(req.params.resource, function(err, note) {
      if (err) res.send(err);
      res.json(note);
    });
  })
  .put('/:resource',function(req, res){
    req.body.root = nlp.text(req.body.body).root();
		var self = this;
		var promises = keywordsFromNoteRequest( req, res );
		// console.log('note pre-mongoose promises created');
		Q.all(promises).then(function(results){
			// console.log('note pre-mongoose promises resolved');
      
      // unpack array of resolved promises
			var req  = results.shift();
			var res  = results.shift();
      var ensuredKeywords = results.shift();
      
      // add ensured keywords to the note
      req.body.keywords = keywordsFromNodes( ensuredKeywords );

			NoteModel.findById(req.params.resource, function(err, resource ) {
				if (err) res.send(err);
				for(var param in req.body){
					resource[param] = req.body[param];
				}
				resource.save(function(err) {
					if (err) res.send(err);
					res.json( resource );
				});
			});
		}).catch(function(error){
			console.log("bad request");
      console.log(error);
			res.status(400).send("bad request");
		});
	})
  .get('/:resource/params',function(req,res){
    var NoteModel = loadCollectionModel(req.params.collection,req,res);
    NoteModel.findById(req.params.resource,function(err,note){
      if(err||!note||note==null)return res.send(err);
      return res.send(Object.keys(note._doc));
    });
  })
  .get('/:resource/params/:name',function(req,res){
    var NoteModel = loadCollectionModel(req.params.collection,req,res);
    NoteModel.findById(req.params.resource,function(err,note){
      if(err||!note||note==null)return res.send(err);
      if(!note[req.params.name])return res.send(null);
      return res.send(note[req.params.name]);
    });
  })
	.get('/:resource/related',function(req, res){
    var NoteModel = loadCollectionModel('note',req,res);
    var promises = [Q(req),Q(res)];
    NoteModel.findById(req.params.resource,function(err,note){
      if(err||!note||note==null)return res.send(err);
      if(!note.keywords){
        return res.send('no keywords');
      }
      for(var r in note.keywords){
        var resource = note.keywords[r];
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
  .delete('/:resource', function(req, res) {
		var mongoId = req.params.resource;
    NoteModel.remove({
      _id: mongoId
    }, function(err, deleted) {
      if (err) res.send(err);
			Neo4j.clearNodeTags( mongoId );
			Neo4j.clearRelationshipTags( mongoId );
      res.json({ message: 'Successfully deleted' });
    });
  });
