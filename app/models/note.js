var mongoose           = require('mongoose');
var soundex            = require('soundex');
var Schema             = mongoose.Schema;
var Neo4jController    = require('../controllers/neo4jController');
var NoteSchema         = new Schema( require('../schemas/note') );
var Q                  = require('q');
var nlp                = require('nlp_compromise');
var arrayUnique = function(a) {
    return a.reduce(function(p, c) {
        if (p.indexOf(c) < 0) p.push(c);
        return p;
    }, []);
};
NoteSchema.pre('update', function() {
  this.update({},{ $set: { modified: new Date() } });
});
NoteSchema.pre('save', true, function(next, done) {
  var self = this;
  // generate soundex from name
  self.soundex = soundex(self.name,true);
  // calling next kicks off the next middleware in parallel
  next();
  setTimeout(done, 100);
});
NoteSchema.post('save', function(next, done) {
  var self = this.toObject();
  console.log('indexing "'+self.name+'" ('+self._id+')');
  
  
  Q(self).then(function(self){
    //
    // ensure this note exists in the index
    //
    var note = self;
    var promises = [Q(note)];
    promises.push(Neo4jController.ensureNode({
      type: 'NOTE',
      name: self.mongoId,
      version: self.__v
    }));
    return Q.all(promises);
  })
  .then(function(results){
    //
    // clear all tags in the index that reference this document _id
    //  
    var note = results.shift();
    var node = results.shift();
    note.neo4jId = node.data[0][0]._id;
    Neo4jController.detachNodeByTypeNameVersion('NOTE',note.name,note._id )
    .fail(function(err){
      console.log(err);
    })
    .done(function(err){
      
    })
    ;
    
    return Q.all([
      Q(self),
      Neo4jController.clearRelationshipTags( self._id ),
      Neo4jController.clearNodeTags( self._id ),
    ]);
  })
  .then(function(results){
    //
    // after clearing, tag all nodes with this _id
    //
    var note = results.shift();
    var promises = [Q(note)];
    for(var r in note.keywords){
      var keyword = note.keywords[r].neo4jId;
      promises.push(Neo4jController.tagNode( keyword, note._id ));
    }
    return Q.all(promises);
  }).then(function(results){
    //
    // search for relationships
    //
    var note = results.shift();
    var promises = [];
    for(var r=0; r<note.keywords.length; r++){
      var src = note.neo4jId;
      var dst = note.keywords[r].neo4jId;
      if(isNaN(src)||isNaN(dst)){
        console.log('WARNING: bad Neo4j id; skipping this relationship');
        continue;
      }
      promises.push(Neo4jController.findRelationship( src, dst, 'INCLUDES' ));
    }
    return Q.all([Q(note)].concat(promises));
  }).then(function(results){
    //
    // tag or create relationships
    //
    var note = results.shift();
    var promises = [Q(note)];
    for(var r=0; r<results.length; r++){
      var rel = {
        mongoId: note._id,
        type: 'INCLUDES'
      };
      var src = note.neo4jId;
      var dst = note.keywords[r].neo4jId;
      var relationshipResults = results[r];
      if( !relationshipResults ||
          !relationshipResults.data ||
           relationshipResults.data.length == 0 ){
        promises.push(Neo4jController.addRelationship( src, dst, rel ));
      }else{
        promises.push(Neo4jController.tagRelationship( src, dst, rel.type, note._id ));
      }
    }
    return Q.all(promises);
  }).then(function(results){
    //
    // add this note to the index
    //
    var note = results.shift();
    var resource = {
      type:"PROCESS",
      name:note.name,
      version:note._id.toString()
    };
    var promises = [Q(note)];
    resource = Neo4jController.validateNode(resource);
		promises.push(Neo4jController.ensureNode(resource)); // ensured request with Neo4j ID
    return Q.all(promises);
  }).then(function(results){
    var note = results.shift();
    var noteNode = results.shift().data[0][0];
    var promises = [Q(note)];
    noteId = noteNode._id;
    for(var r in note.resources){
      var resource = note.resources[r];
      promises.push(Neo4jController.addRelationship( noteId, resource.neo4jId, {type:'INCLUDES'}));
    }
    return Q.all(promises);
  }).fail(function(results){
    console.log('could not update the index');
    console.log(results);
  }).done(function(results){
    console.log('indexing complete');
  });
});
module.exports = mongoose.model('Note', NoteSchema);
