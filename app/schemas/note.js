var express = require('express');
var mongoose = require('mongoose');
mongoose.Promise = require('q').Promise;
var Schema = mongoose.Schema;

module.exports = {
  name:            String,
  body:            String,
  root:            String,
  description:     String,
  created:         Date,    // date created
  modified: {
    type:          Date,
    default:       Date.now
  },
  author:          String,
  contributors: [{
    name:          String
  }],
  keywords:      [ Schema.Types.Mixed ],
  metadata:        Schema.Types.Mixed // extensible here
};