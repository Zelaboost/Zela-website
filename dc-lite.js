/* dc-lite: a tiny runtime for Zela's interactive pages.
   Renders <template id="dc-tpl"> with the component in <script type="text/x-dc-logic">
   into #dc-root, and re-renders on setState by morphing the live DOM. */
(function () {
  'use strict';
  var tpl = document.getElementById('dc-tpl');
  var root = document.getElementById('dc-root');
  var src = document.querySelector('script[type="text/x-dc-logic"]');
  if (!tpl || !root || !src) return;

  function DCLogic(props) { this.props = props || {}; this.state = {}; }
  DCLogic.prototype.setState = function (patch) {
    var p = typeof patch === 'function' ? patch(this.state) : patch;
    this.state = Object.assign({}, this.state, p);
    schedule();
  };
  var Component = new Function('DCLogic', src.textContent + '\n;return Component;')(DCLogic);

  var comp = new Component({});
  if (!comp.state) comp.state = {};
  if (!comp.setState) comp.setState = DCLogic.prototype.setState;
  if (!comp.props) comp.props = {};

  var HOLE = /\{\{\s*([^}]+?)\s*\}\}/g;
  var ONE = /^\s*\{\{\s*([^}]+?)\s*\}\}\s*$/;

  function lookup(path, scope) {
    if (path === 'true') return true;
    if (path === 'false') return false;
    if (path === 'null') return null;
    if (/^-?\d+(\.\d+)?$/.test(path)) return parseFloat(path);
    var parts = path.split('.');
    var v = scope;
    for (var i = 0; i < parts.length; i++) {
      if (v == null) return undefined;
      v = v[parts[i]];
    }
    return v;
  }
  function interp(str, scope) {
    return str.replace(HOLE, function (_, p) { var v = lookup(p, scope); return v == null ? '' : String(v); });
  }

  var refs = [];
  var keySeq = 0;

  function expandChildren(parentTpl, scope, out, keyPrefix) {
    var kids = parentTpl.childNodes;
    for (var i = 0; i < kids.length; i++) expand(kids[i], scope, out, keyPrefix);
  }

  function expand(node, scope, out, keyPrefix) {
    if (node.nodeType === 3) {
      out.appendChild(document.createTextNode(node.nodeValue.indexOf('{{') >= 0 ? interp(node.nodeValue, scope) : node.nodeValue));
      return;
    }
    if (node.nodeType !== 1) return;
    var tag = node.nodeName.toLowerCase();
    if (!node.__id) node.__id = 'n' + (++keySeq);
    if (tag === 'sc-for') {
      var listPath = (ONE.exec(node.getAttribute('list') || '') || [])[1];
      var list = listPath ? lookup(listPath, scope) : null;
      var as = node.getAttribute('as') || 'item';
      if (list && list.length) {
        for (var k = 0; k < list.length; k++) {
          var s2 = Object.create(scope); s2[as] = list[k];
          expandChildren(node, s2, out, keyPrefix + node.__id + ':' + k + '/');
        }
      }
      return;
    }
    if (tag === 'sc-if') {
      var vPath = (ONE.exec(node.getAttribute('value') || '') || [])[1];
      if (vPath && lookup(vPath, scope)) expandChildren(node, scope, out, keyPrefix + node.__id + '/');
      return;
    }
    var el = node.cloneNode(false);
    el.__key = keyPrefix + node.__id;
    var attrs = Array.prototype.slice.call(el.attributes);
    for (var a = 0; a < attrs.length; a++) {
      var name = attrs[a].name, val = attrs[a].value;
      if (name.indexOf('hint-') === 0) { el.removeAttribute(name); continue; }
      if (val.indexOf('{{') < 0) continue;
      var one = ONE.exec(val);
      if (/^on[a-z]+$/i.test(name) && one) {
        el.removeAttribute(name);
        var fn = lookup(one[1], scope);
        if (typeof fn === 'function') { (el.__h || (el.__h = {}))[name.slice(2).toLowerCase()] = fn; }
        continue;
      }
      if (name === 'ref' && one) {
        el.removeAttribute(name);
        var rf = lookup(one[1], scope);
        if (typeof rf === 'function') el.__ref = rf;
        continue;
      }
      el.setAttribute(name, interp(val, scope));
    }
    var content = node.content || node; // <template> safety
    expandChildren(content, scope, el, keyPrefix);
    out.appendChild(el);
  }

  function bind(el) {
    if (!el.__h) return;
    el.__bound = el.__bound || {};
    Object.keys(el.__h).forEach(function (type) {
      if (el.__bound[type]) return;
      el.__bound[type] = true;
      el.addEventListener(type, function (e) { var f = el.__h && el.__h[type]; if (f) f(e); });
    });
  }

  function syncAttrs(oldEl, newEl) {
    var na = newEl.attributes, oa = oldEl.attributes, i;
    for (i = oa.length - 1; i >= 0; i--) {
      var n = oa[i].name;
      if (!newEl.hasAttribute(n)) oldEl.removeAttribute(n);
    }
    for (i = 0; i < na.length; i++) {
      if (oldEl.getAttribute(na[i].name) !== na[i].value) oldEl.setAttribute(na[i].name, na[i].value);
    }
    oldEl.__h = newEl.__h; oldEl.__key = newEl.__key; oldEl.__ref = newEl.__ref;
  }

  function adopt(el) {
    // a brand-new subtree: bind handlers and collect refs
    if (el.nodeType !== 1) return;
    bind(el);
    if (el.__ref) refs.push(el);
    for (var c = el.firstChild; c; c = c.nextSibling) adopt(c);
  }

  function same(a, b) {
    if (a.nodeType !== b.nodeType) return false;
    if (a.nodeType !== 1) return true;
    if (a.nodeName !== b.nodeName) return false;
    if (a.__key !== undefined && a.__key !== b.__key) return false;
    return true;
  }

  function morphChildren(oldP, newP) {
    var o = oldP.firstChild, n = newP.firstChild;
    while (n) {
      var nextN = n.nextSibling;
      if (!o) { oldP.appendChild(n); adopt(n); n = nextN; continue; }
      var nextO = o.nextSibling;
      if (same(o, n)) {
        if (o.nodeType === 1) {
          syncAttrs(o, n); bind(o); if (o.__ref) refs.push(o);
          morphChildren(o, n);
        } else if (o.nodeValue !== n.nodeValue) {
          o.nodeValue = n.nodeValue;
        }
        o = nextO;
      } else {
        oldP.insertBefore(n, o); adopt(n);
        // drop the old node if the next new node does not match it
        if (!nextN || !same(o, nextN)) { oldP.removeChild(o); o = nextO; }
      }
      n = nextN;
    }
    while (o) { var nx = o.nextSibling; oldP.removeChild(o); o = nx; }
  }

  var pending = false, mounted = false;
  function render() {
    pending = false;
    var vals = comp.renderVals ? comp.renderVals() : {};
    var frag = document.createElement('div');
    refs = [];
    expandChildren(tpl.content, vals, frag, '');
    if (!mounted && root.hasAttribute('data-prerendered')) {
      // keys are unknown on prerendered markup: treat it as unkeyed
      (function clear(el) { for (var c = el.firstChild; c; c = c.nextSibling) { if (c.nodeType === 1) { c.__key = undefined; clear(c); } } })(root);
      morphChildrenLoose(root, frag);
    } else {
      morphChildren(root, frag);
    }
    refs.forEach(function (el) { try { el.__ref(el); } catch (e) {} });
    if (!mounted) { mounted = true; if (comp.componentDidMount) comp.componentDidMount(); }
  }
  function morphChildrenLoose(oldP, newP) {
    // first pass over prerendered HTML: match by tag, adopt keys from the new tree
    var o = oldP.firstChild, n = newP.firstChild;
    while (n) {
      var nextN = n.nextSibling;
      if (!o) { oldP.appendChild(n); adopt(n); n = nextN; continue; }
      var nextO = o.nextSibling;
      if (o.nodeType === n.nodeType && (o.nodeType !== 1 || o.nodeName === n.nodeName)) {
        if (o.nodeType === 1) { syncAttrs(o, n); bind(o); if (o.__ref) refs.push(o); morphChildrenLoose(o, n); }
        else if (o.nodeValue !== n.nodeValue) o.nodeValue = n.nodeValue;
        o = nextO;
      } else {
        oldP.replaceChild(n, o); adopt(n); o = nextO;
      }
      n = nextN;
    }
    while (o) { var nx = o.nextSibling; oldP.removeChild(o); o = nx; }
  }
  function schedule() {
    if (pending || !mounted) return;
    pending = true;
    (window.requestAnimationFrame || setTimeout)(render);
  }
  render();
})();
