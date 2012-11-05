
(function(context) {



  var tss = context.tss = function(selector) { return tss.select(selector); };

  tss.selectors = {};
  tss.threeObjects = {};


  tss.select = function(selector) {
    return tss.threeObjects[selector];
  }

  /* Find all tss style tags and parse them 
   * TODO: grab any TSS links, download via ajax, and parse */
  tss.init = function() {
    var styleTags = document.getElementsByTagName("style");

    for(var i=0;i<styleTags.length;i++) {
      var style = styleTags[i];

      if(style.type == "tss" && !style.getAttribute('data-tss-parsed')) {
        style.setAttribute("data-tss-parsed",true);
        tss.add(style.innerHTML);
      }
    }
  };

  tss._extend = function(dest,source) {
    if(!source) { return dest; }
    for (var prop in source) {
      dest[prop] = source[prop];
    }
    return dest;
  };

  /* Return whether or not all found stylesheets have been parsed */
  tss.ready = function(callback) {

  };



  tss.add = function(code) {
    tss.generateObjects(tss.parseTss(code));
  };


  tss.generateObjects = function(definition) {
    var rules = definition.stylesheet.rules;

    for(var i=0;i<rules.length;i++) {
      tss.parseRule(rules[i]);
    }

    tss.createObjects();
  };

  tss.parseRule = function(rule) {
    var properties = {};
    for(var i=0;i<rule.declarations.length;i++) {
      var declaration = rule.declarations[i];
      properties[declaration.property] = declaration.value;
    }

    for(var k=0;k<rule.selectors.length;k++) {
      var selector = rule.selectors[k];
      tss.selectors[selector] = tss.selectors[selector] || {};
      tss._extend(tss.selectors[selector],properties);
    }
  };

  tss.createObjects = function () {
    var selectorList = [];

    for (var name in tss.selectors) {
      if(!tss.threeObjects[name]) {
        selectorList.push( [ name, tss.selectors[name] ] );
      }
    }

    var noChange = 0;
    while(selectorList.length > 0 && noChange < selectorList.length + 5) {
      var curSelector = selectorList.shift();

      if(tss.processStyle(curSelector[0],curSelector[1])) {
        noChange = 0;
      } else {
        noChange++;
        // Push it back onto the end and try to process again later.
        selectorList.push(curSelector);
      }

    }
  };

  tss.processStyle = function(selector,rules) {
    var result = null;

    // Return false if can't find a tss object
    if(!tss.transformValues(rules)) { return false; }

    switch(selector.charAt(0)) {
      case "@":
       result = tss.processTextureStyle(selector, rules);
       break;
      case ".":
       result =tss.processMaterialStyle(selector,rules);
       break;
      case "%":
       result =tss.processGeometryStyle(selector,rules);
       break;
      default:
       result = tss.processMeshStyle(selector,rules);
    }

    if(result) {
      tss.threeObjects[selector] = result;
      return true;
    } else {
      return false;
    }
  };

  tss.processTextureStyle = function(selector,rules) {
    if(!rules.url) { throw "Texture " + selector + " Missing URL property"; }

    var texture = THREE.ImageUtils.loadTexture(tss.parseString(rules.url)); 

    if(rules.repeat) {
      var repeat = rules.repeat;
      texture.repeat.set(repeat[0],repeat[1] || repeat[0]);
    }

    if(rules.anisotropy) {
      texture.anisotropy = rules.anisotropy;
    }

		// imgTexture.wrapS = imgTexture.wrapT = THREE.RepeatWrapping;

    return texture;
  }

  tss.processGeometryStyle = function(selector,rules) {
    if(!rules.type) { throw "Geometry " + selector + " Missing type property"; }

    switch(rules.type.toLowerCase()) {
      case "sphere":
        return new THREE.SphereGeometry( rules.radius, rules.segments, rules.rings);
      default:
        throw "Geometry " + selector + " Invalid Type " + rules.type; 
    }
  };


  tss.processMaterialStyle = function(selector,rules) {
    tss.validateRules(selector,rules,"type");

    if(THREE[ rules.type + "Material"]) {
      var options = tss._extend({},rules);
      delete options['type'];
      return new THREE[rules.type + "Material"](options);
    } else {
      throw "Invalid Material Type " + selector + " " + rules.type; 
    }
  };


  tss.processMeshStyle = function(selector,rules) {
    tss.validateRules(selector,rules,"geometry","material");

    return function(props) {
      return new THREE.Mesh(rules.geometry, rules.material );
    }
  }

  tss._trim = function(str)  {
    return str.replace(/^\s+|\s+$/, '');
  }

  tss.transformValues = function(rules) {
    for (var prop in rules) {
      var vals = tss._trim(rules[prop]).split(" ");

      for(var i=0;i< vals.length;i++) {
        var val = vals[i],
            floatVal = parseFloat(val),
            firstChar = val.charAt(0);

        // Check for hexideixmals 0x    
        if(!isNaN(floatVal)) { 
          vals[i]= floatVal;
        } else if(firstChar == "#") {
          vals[i] = parseInt(val.slice(1),16);
        } else if(firstChar == "@" || firstChar == "." || firstChar == "%") {
          if(!tss(val)) { return false; }
          vals[i] = tss(val);
        } else if( THREE[val] ) {
          vals[i] = THREE[val];
        }
      }

      if(vals.length > 1) {
        rules[prop] = vals;
      } else {
        rules[prop] = vals[0];
      }
    }

    return true;
  };

  tss.parseString = function(str) {
     return str.replace(/^"(.*?)"/,"$1");
  };

  tss.validateRules = function(selector,rules) {
    for(var i = 2;i<arguments.length;i++) {
      if(rules[arguments[i]] == void 0) {
        throw "Geometry " + selector + " missing property " + arguments[i];
      }
    }
  };

  tss.floatRules = function(selector,rules) {
    for(var i = 2;i<arguments.length;i++) {
      if(rules[arguments[i]] != void 0) {
        rules[arguments[i]] = parseFloat(rules[arguments[i]]);
      }
    }
  };

  /* Bastardized version of TJ Holowaychuk's */
  /* https://github.com/visionmedia/node-css-parse */
  tss.parseTss = function(css){

    /**
     * Parse stylesheet.
     */

    function stylesheet() {
      return { stylesheet: { rules: rules() }};
    }

    /**
     * Opening brace.
     */

    function open() {
      return match(/^{\s*/);
    }

    /**
     * Closing brace.
     */

    function close() {
      return match(/^}\s*/);
    }

    /**
     * Parse ruleset.
     */

    function rules() {
      var node;
      var rules = [];
      whitespace();
      comments();
      while (css[0] != '}' && (node = atrule() || rule())) {
        comments();
        rules.push(node);
      }
      return rules;
    }

    /**
     * Match `re` and return captures.
     */

    function match(re) {
      var m = re.exec(css);
      if (!m) return;
      css = css.slice(m[0].length);
      return m;
    }

    /**
     * Parse whitespace.
     */

    function whitespace() {
      match(/^\s*/);
    }

    /**
     * Parse comments;
     */

    function comments() {
      while (comment()) ;
    }

    /**
     * Parse comment.
     */

    function comment() {
      if ('/' == css[0] && '*' == css[1]) {
        var i = 2;
        while ('*' != css[i] || '/' != css[i + 1]) ++i;
        i += 2;
        css = css.slice(i);
        whitespace();
        return true;
      }
    }

    /**
     * Parse selector.
     */

    function selector() {
      var m = match(/^([^{]+)/);
      if (!m) return;
      return m[0].trim().split(/\s*,\s*/);
    }

    /**
     * Parse declaration.
     */

    function declaration() {
      // prop
      var prop = match(/^(\*?[-\w]+)\s*/);
      if (!prop) return;
      prop = prop[0];

      // :
      if (!match(/^:\s*/)) return;

      // val
      var val = match(/^((?:'(?:\\'|.)*?'|"(?:\\"|.)*?"|\([^\)]*?\)|[^};])+)\s*/);
      if (!val) return;
      val = val[0].trim();

      // ;
      match(/^[;\s]*/);

      return { property: prop, value: val };
    }

    /**
     * Parse keyframe.
     */

    function keyframe() {
      var m;
      var vals = [];

      while (m = match(/^(from|to|\d+%|\.\d+%|\d+\.\d+%)\s*/)) {
        vals.push(m[1]);
        match(/^,\s*/);
      }

      if (!vals.length) return;

      return {
        values: vals,
        declarations: declarations()
      };
    }

    /**
     * Parse keyframes.
     */

    function keyframes() {
      var m = match(/^@([-\w]+)?keyframes */);
      if (!m) return;
      var vendor = m[1];

      // identifier
      var m = match(/^([-\w]+)\s*/);
      if (!m) return;
      var name = m[1];

      if (!open()) return;
      comments();

      var frame;
      var frames = [];
      while (frame = keyframe()) {
        frames.push(frame);
        comments();
      }

      if (!close()) return;

      return {
        name: name,
        vendor: vendor,
        keyframes: frames
      };
    }

    /**
     * Parse media.
     */

    function media() {
      var m = match(/^@media *([^{]+)/);
      if (!m) return;
      var media = m[1].trim();

      if (!open()) return;
      comments();

      var style = rules();

      if (!close()) return;

      return { media: media, rules: style };
    }

    /**
     * Parse import
     */

    function atimport() {
      return _atrule('import')
    }

    /**
     * Parse charset
     */

    function atcharset() {
      return _atrule('charset');
    }

    /**
     * Parse non-block at-rules
     */

    function _atrule(name) {
      var m = match(new RegExp('^@' + name + ' *([^;\\n]+);\\s*'));
      if (!m) return;
      var ret = {}
      ret[name] = m[1].trim();
      return ret;
    }

    /**
     * Parse declarations.
     */

    function declarations() {
      var decls = [];

      if (!open()) return;
      comments();
    
      // declarations
      var decl;
      while (decl = declaration()) {
        decls.push(decl);
        comments();
      }
    
      if (!close()) return;
      return decls;
    }

    /**
     * Parse at rule.
     */
     
    function atrule() {
      return keyframes()
        || media()
        || atimport()
        || atcharset();
    }

    /**
     * Parse rule.
     */
    
    function rule() {
      var sel = selector();
      if (!sel) return;
      comments();
      return { selectors: sel, declarations: declarations() };
    }
    
    return stylesheet();
  };

}(window));
