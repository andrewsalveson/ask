// LOCAL DEVELOPMENT

if(process.env.NODE_ENV == 'development' || !process.env.NODE_ENV ){
  module.exports = {
      url : 'mongodb://mongo:27017'
  };
}

// PRODUCTION AND/OR STAGING

if((process.env.NODE_ENV == 'production') || (process.env.NODE_ENV == 'staging')){
  module.exports = {
    url : 'mongodb://mongo:27017'
  };
}

