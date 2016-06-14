// LOCAL DEVELOPMENT

if(process.env.NODE_ENV == 'development' || !process.env.NODE_ENV ){
  module.exports = {
      url : 'http://neo4j:Perkinswill1@neo4j:7474'
  };
}

// PRODUCTION AND/OR STAGING

if((process.env.NODE_ENV == 'production') || (process.env.NODE_ENV == 'staging')){
  module.exports = {
    url : 'http://neo4j:neo4j@neo4j:7474'
  };
}
