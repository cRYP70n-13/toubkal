/*  examples.js

    The MIT License (MIT)

    Copyright (c) 2013-2016, Reactive Sets

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE.
*/
module.exports = function( servers ) {
  'use strict';
  
  var rs          = servers.create_namespace( 'examples' ) // child namespace
    , RS          = rs.RS
    , extend      = RS.extend
    , log         = RS.log.bind( null, 'examples' )
    , de          = true
    , ug          = log
    , assets      = require( 'toubkal/lib/server/client_assets.js' )
    , toubkal_min = assets.toubkal_min()
    , react_js    = assets.react.watch()
    , scope       = {}
  ;
  
  // servers is the virtual servers used by examples.js only
  // so we can set its namespace
  servers.set_namespace( rs ); // set namespace to servers' child namespace
  
  // Listen when lib/toubkal-min.js is ready
  servers.http_listen( toubkal_min );
  
  /* ------------------------------------------------------------------------------------
     Watch all directories from here
  */
  rs
    .Singleton( 'directory_entries', function( source, options ) {
      return source
        .watch_directories( extend._2( { base_directory: __dirname } ) )
        
        .filter( ignore_temporary_files )
      ;
      
      function ignore_temporary_files( entry ) {
        return entry.extension.slice( -1 )  != '~'
            && entry.base.substring( 0, 2 ) != '.#'
        ;
      }
    } )
    
    .set( [ { path: '' } ] )
    
    .directory_entries()
    
    .filter( [ { type: 'directory' } ] )
    
    .directory_entries()
    
    /* ------------------------------------------------------------------------------------
       Load and Serve Static Assets
    */
    .set_output( 'assets', scope )
    
    .filter( [
      { extension: 'html' },
      { extension: 'css'  },
      { extension: 'js'   },
      { extension: 'json' }
    ] )
    
    .watch( { base_directory: __dirname } )
    
    .union( [ toubkal_min, react_js ] )
    
    // Serve assets to http servers
    .serve( servers )
  ;
  
  /* ------------------------------------------------------------------------------------
     The database, made of all found json files
  */
  rs
    .directory_entries()
    
    .filter( [ { extension: 'json' } ] )
    
    .map( function( table ) {
      var path = table.path
        , flow = path.split( '.' )
      ;
      
      flow.pop(); // remove 'json' extension
      
      flow = flow.join( '.' ); // e.g. datasets/sales
      
      return { flow: '/table', 'name': flow, 'path': path };
    } )
    
    .optimize()
    
    .trace( 'database tables' )
    
    .flow( '/table' )
    
    .set_output( 'tables', scope )
    
    // socket.io clients
    .Singleton( 'examples_clients', function( source, options ) {
      return source
        .dispatch( servers.socket_io_clients(), function( source, options ) {
          
          return source.through( this.socket );
        }, { single: true } )
      ;
    } )
    
    .examples_clients()
  ;
  
  rs.output( 'assets', scope )
    .filter( [
      { extension: 'html' },
      { extension: 'css'  },
      { extension: 'js'   },
    ] )
    
    .to_uri()
    
    .filter( function( a ) {
      return [ '/server.js', '/examples.js' ].indexOf( a.uri ) == -1
        && 'data.js' != a.base
      ;
    } )
    
    .map( function( a ) {
      return {
        flow: 'assets', id: a.uri, size: a.size, mtime: a.mtime
      }
    }, { key: [ 'id' ] } )
    
    .optimize() // make updates
    
    // filter-out non-assets fetches
    .flow( 'assets' )
    
    .examples_clients()
  ;
  
  // Serve database to socket.io clients
  // ToDo: add option to dispatch() to use a union() as dispatcher instead of pass_through()
  // ToDo: or maybe, make path_through() a union() so that it becomes a controllet
  // ToDo: or just deprecate path_through() altogether
  rs
    .Singleton( 'examples_database', function( source, tables, options ) {
      return source
        .dispatch( tables, function( source, options ) {
          var flow = this.name;
          
          return source
            .configuration( { 'filepath': this.path, 'flow': flow, 'base_directory': __dirname  } )
            .trace( 'table ' + flow )
            .set_flow( flow )
          ;
        } )
      ;
    } )
    
    .examples_database( rs.output( 'tables', scope ) )
    
    .examples_clients()
  ;
  
  // Require examples' data processors
  rs
    .directory_entries()
    
    .filter( [ { extension: 'js', depth: 2 } ] )
    
    .filter( function( file ) {
      return file.path.split( '/' ).pop() == 'data.js';
    } )
    
    .trace( 'data processors' ).set_output( 'data_processors', scope )
  ;
  
  rs.dispatch( rs.output( 'data_processors', scope ), function() {
    // ToDo: cleanup required when removing a data processor, need to disconnect data from examples_database and clients, and remove from require cache
    // ToDo: allow to hot-reload data-processor
    
    var data_processor = './' + this.path
      , path = require.resolve( data_processor )
    ;
    
    de&&ug( 'require data processor:', data_processor );
    
    delete require.cache[ path ];
    
    require( path )( rs.examples_database(), rs.examples_clients() );
  } );
} // module.exports
