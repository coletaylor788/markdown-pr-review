"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// node_modules/diff-match-patch/index.js
var require_diff_match_patch = __commonJS({
  "node_modules/diff-match-patch/index.js"(exports2, module2) {
    var diff_match_patch2 = function() {
      this.Diff_Timeout = 1;
      this.Diff_EditCost = 4;
      this.Match_Threshold = 0.5;
      this.Match_Distance = 1e3;
      this.Patch_DeleteThreshold = 0.5;
      this.Patch_Margin = 4;
      this.Match_MaxBits = 32;
    };
    var DIFF_DELETE = -1;
    var DIFF_INSERT = 1;
    var DIFF_EQUAL = 0;
    diff_match_patch2.Diff = function(op, text) {
      return [op, text];
    };
    diff_match_patch2.prototype.diff_main = function(text1, text2, opt_checklines, opt_deadline) {
      if (typeof opt_deadline == "undefined") {
        if (this.Diff_Timeout <= 0) {
          opt_deadline = Number.MAX_VALUE;
        } else {
          opt_deadline = (/* @__PURE__ */ new Date()).getTime() + this.Diff_Timeout * 1e3;
        }
      }
      var deadline = opt_deadline;
      if (text1 == null || text2 == null) {
        throw new Error("Null input. (diff_main)");
      }
      if (text1 == text2) {
        if (text1) {
          return [new diff_match_patch2.Diff(DIFF_EQUAL, text1)];
        }
        return [];
      }
      if (typeof opt_checklines == "undefined") {
        opt_checklines = true;
      }
      var checklines = opt_checklines;
      var commonlength = this.diff_commonPrefix(text1, text2);
      var commonprefix = text1.substring(0, commonlength);
      text1 = text1.substring(commonlength);
      text2 = text2.substring(commonlength);
      commonlength = this.diff_commonSuffix(text1, text2);
      var commonsuffix = text1.substring(text1.length - commonlength);
      text1 = text1.substring(0, text1.length - commonlength);
      text2 = text2.substring(0, text2.length - commonlength);
      var diffs = this.diff_compute_(text1, text2, checklines, deadline);
      if (commonprefix) {
        diffs.unshift(new diff_match_patch2.Diff(DIFF_EQUAL, commonprefix));
      }
      if (commonsuffix) {
        diffs.push(new diff_match_patch2.Diff(DIFF_EQUAL, commonsuffix));
      }
      this.diff_cleanupMerge(diffs);
      return diffs;
    };
    diff_match_patch2.prototype.diff_compute_ = function(text1, text2, checklines, deadline) {
      var diffs;
      if (!text1) {
        return [new diff_match_patch2.Diff(DIFF_INSERT, text2)];
      }
      if (!text2) {
        return [new diff_match_patch2.Diff(DIFF_DELETE, text1)];
      }
      var longtext = text1.length > text2.length ? text1 : text2;
      var shorttext = text1.length > text2.length ? text2 : text1;
      var i = longtext.indexOf(shorttext);
      if (i != -1) {
        diffs = [
          new diff_match_patch2.Diff(DIFF_INSERT, longtext.substring(0, i)),
          new diff_match_patch2.Diff(DIFF_EQUAL, shorttext),
          new diff_match_patch2.Diff(
            DIFF_INSERT,
            longtext.substring(i + shorttext.length)
          )
        ];
        if (text1.length > text2.length) {
          diffs[0][0] = diffs[2][0] = DIFF_DELETE;
        }
        return diffs;
      }
      if (shorttext.length == 1) {
        return [
          new diff_match_patch2.Diff(DIFF_DELETE, text1),
          new diff_match_patch2.Diff(DIFF_INSERT, text2)
        ];
      }
      var hm = this.diff_halfMatch_(text1, text2);
      if (hm) {
        var text1_a = hm[0];
        var text1_b = hm[1];
        var text2_a = hm[2];
        var text2_b = hm[3];
        var mid_common = hm[4];
        var diffs_a = this.diff_main(text1_a, text2_a, checklines, deadline);
        var diffs_b = this.diff_main(text1_b, text2_b, checklines, deadline);
        return diffs_a.concat(
          [new diff_match_patch2.Diff(DIFF_EQUAL, mid_common)],
          diffs_b
        );
      }
      if (checklines && text1.length > 100 && text2.length > 100) {
        return this.diff_lineMode_(text1, text2, deadline);
      }
      return this.diff_bisect_(text1, text2, deadline);
    };
    diff_match_patch2.prototype.diff_lineMode_ = function(text1, text2, deadline) {
      var a = this.diff_linesToChars_(text1, text2);
      text1 = a.chars1;
      text2 = a.chars2;
      var linearray = a.lineArray;
      var diffs = this.diff_main(text1, text2, false, deadline);
      this.diff_charsToLines_(diffs, linearray);
      this.diff_cleanupSemantic(diffs);
      diffs.push(new diff_match_patch2.Diff(DIFF_EQUAL, ""));
      var pointer = 0;
      var count_delete = 0;
      var count_insert = 0;
      var text_delete = "";
      var text_insert = "";
      while (pointer < diffs.length) {
        switch (diffs[pointer][0]) {
          case DIFF_INSERT:
            count_insert++;
            text_insert += diffs[pointer][1];
            break;
          case DIFF_DELETE:
            count_delete++;
            text_delete += diffs[pointer][1];
            break;
          case DIFF_EQUAL:
            if (count_delete >= 1 && count_insert >= 1) {
              diffs.splice(
                pointer - count_delete - count_insert,
                count_delete + count_insert
              );
              pointer = pointer - count_delete - count_insert;
              var subDiff = this.diff_main(text_delete, text_insert, false, deadline);
              for (var j = subDiff.length - 1; j >= 0; j--) {
                diffs.splice(pointer, 0, subDiff[j]);
              }
              pointer = pointer + subDiff.length;
            }
            count_insert = 0;
            count_delete = 0;
            text_delete = "";
            text_insert = "";
            break;
        }
        pointer++;
      }
      diffs.pop();
      return diffs;
    };
    diff_match_patch2.prototype.diff_bisect_ = function(text1, text2, deadline) {
      var text1_length = text1.length;
      var text2_length = text2.length;
      var max_d = Math.ceil((text1_length + text2_length) / 2);
      var v_offset = max_d;
      var v_length = 2 * max_d;
      var v1 = new Array(v_length);
      var v2 = new Array(v_length);
      for (var x = 0; x < v_length; x++) {
        v1[x] = -1;
        v2[x] = -1;
      }
      v1[v_offset + 1] = 0;
      v2[v_offset + 1] = 0;
      var delta = text1_length - text2_length;
      var front = delta % 2 != 0;
      var k1start = 0;
      var k1end = 0;
      var k2start = 0;
      var k2end = 0;
      for (var d = 0; d < max_d; d++) {
        if ((/* @__PURE__ */ new Date()).getTime() > deadline) {
          break;
        }
        for (var k1 = -d + k1start; k1 <= d - k1end; k1 += 2) {
          var k1_offset = v_offset + k1;
          var x1;
          if (k1 == -d || k1 != d && v1[k1_offset - 1] < v1[k1_offset + 1]) {
            x1 = v1[k1_offset + 1];
          } else {
            x1 = v1[k1_offset - 1] + 1;
          }
          var y1 = x1 - k1;
          while (x1 < text1_length && y1 < text2_length && text1.charAt(x1) == text2.charAt(y1)) {
            x1++;
            y1++;
          }
          v1[k1_offset] = x1;
          if (x1 > text1_length) {
            k1end += 2;
          } else if (y1 > text2_length) {
            k1start += 2;
          } else if (front) {
            var k2_offset = v_offset + delta - k1;
            if (k2_offset >= 0 && k2_offset < v_length && v2[k2_offset] != -1) {
              var x2 = text1_length - v2[k2_offset];
              if (x1 >= x2) {
                return this.diff_bisectSplit_(text1, text2, x1, y1, deadline);
              }
            }
          }
        }
        for (var k2 = -d + k2start; k2 <= d - k2end; k2 += 2) {
          var k2_offset = v_offset + k2;
          var x2;
          if (k2 == -d || k2 != d && v2[k2_offset - 1] < v2[k2_offset + 1]) {
            x2 = v2[k2_offset + 1];
          } else {
            x2 = v2[k2_offset - 1] + 1;
          }
          var y2 = x2 - k2;
          while (x2 < text1_length && y2 < text2_length && text1.charAt(text1_length - x2 - 1) == text2.charAt(text2_length - y2 - 1)) {
            x2++;
            y2++;
          }
          v2[k2_offset] = x2;
          if (x2 > text1_length) {
            k2end += 2;
          } else if (y2 > text2_length) {
            k2start += 2;
          } else if (!front) {
            var k1_offset = v_offset + delta - k2;
            if (k1_offset >= 0 && k1_offset < v_length && v1[k1_offset] != -1) {
              var x1 = v1[k1_offset];
              var y1 = v_offset + x1 - k1_offset;
              x2 = text1_length - x2;
              if (x1 >= x2) {
                return this.diff_bisectSplit_(text1, text2, x1, y1, deadline);
              }
            }
          }
        }
      }
      return [
        new diff_match_patch2.Diff(DIFF_DELETE, text1),
        new diff_match_patch2.Diff(DIFF_INSERT, text2)
      ];
    };
    diff_match_patch2.prototype.diff_bisectSplit_ = function(text1, text2, x, y, deadline) {
      var text1a = text1.substring(0, x);
      var text2a = text2.substring(0, y);
      var text1b = text1.substring(x);
      var text2b = text2.substring(y);
      var diffs = this.diff_main(text1a, text2a, false, deadline);
      var diffsb = this.diff_main(text1b, text2b, false, deadline);
      return diffs.concat(diffsb);
    };
    diff_match_patch2.prototype.diff_linesToChars_ = function(text1, text2) {
      var lineArray = [];
      var lineHash = {};
      lineArray[0] = "";
      function diff_linesToCharsMunge_(text) {
        var chars = "";
        var lineStart = 0;
        var lineEnd = -1;
        var lineArrayLength = lineArray.length;
        while (lineEnd < text.length - 1) {
          lineEnd = text.indexOf("\n", lineStart);
          if (lineEnd == -1) {
            lineEnd = text.length - 1;
          }
          var line = text.substring(lineStart, lineEnd + 1);
          if (lineHash.hasOwnProperty ? lineHash.hasOwnProperty(line) : lineHash[line] !== void 0) {
            chars += String.fromCharCode(lineHash[line]);
          } else {
            if (lineArrayLength == maxLines) {
              line = text.substring(lineStart);
              lineEnd = text.length;
            }
            chars += String.fromCharCode(lineArrayLength);
            lineHash[line] = lineArrayLength;
            lineArray[lineArrayLength++] = line;
          }
          lineStart = lineEnd + 1;
        }
        return chars;
      }
      var maxLines = 4e4;
      var chars1 = diff_linesToCharsMunge_(text1);
      maxLines = 65535;
      var chars2 = diff_linesToCharsMunge_(text2);
      return { chars1, chars2, lineArray };
    };
    diff_match_patch2.prototype.diff_charsToLines_ = function(diffs, lineArray) {
      for (var i = 0; i < diffs.length; i++) {
        var chars = diffs[i][1];
        var text = [];
        for (var j = 0; j < chars.length; j++) {
          text[j] = lineArray[chars.charCodeAt(j)];
        }
        diffs[i][1] = text.join("");
      }
    };
    diff_match_patch2.prototype.diff_commonPrefix = function(text1, text2) {
      if (!text1 || !text2 || text1.charAt(0) != text2.charAt(0)) {
        return 0;
      }
      var pointermin = 0;
      var pointermax = Math.min(text1.length, text2.length);
      var pointermid = pointermax;
      var pointerstart = 0;
      while (pointermin < pointermid) {
        if (text1.substring(pointerstart, pointermid) == text2.substring(pointerstart, pointermid)) {
          pointermin = pointermid;
          pointerstart = pointermin;
        } else {
          pointermax = pointermid;
        }
        pointermid = Math.floor((pointermax - pointermin) / 2 + pointermin);
      }
      return pointermid;
    };
    diff_match_patch2.prototype.diff_commonSuffix = function(text1, text2) {
      if (!text1 || !text2 || text1.charAt(text1.length - 1) != text2.charAt(text2.length - 1)) {
        return 0;
      }
      var pointermin = 0;
      var pointermax = Math.min(text1.length, text2.length);
      var pointermid = pointermax;
      var pointerend = 0;
      while (pointermin < pointermid) {
        if (text1.substring(text1.length - pointermid, text1.length - pointerend) == text2.substring(text2.length - pointermid, text2.length - pointerend)) {
          pointermin = pointermid;
          pointerend = pointermin;
        } else {
          pointermax = pointermid;
        }
        pointermid = Math.floor((pointermax - pointermin) / 2 + pointermin);
      }
      return pointermid;
    };
    diff_match_patch2.prototype.diff_commonOverlap_ = function(text1, text2) {
      var text1_length = text1.length;
      var text2_length = text2.length;
      if (text1_length == 0 || text2_length == 0) {
        return 0;
      }
      if (text1_length > text2_length) {
        text1 = text1.substring(text1_length - text2_length);
      } else if (text1_length < text2_length) {
        text2 = text2.substring(0, text1_length);
      }
      var text_length = Math.min(text1_length, text2_length);
      if (text1 == text2) {
        return text_length;
      }
      var best = 0;
      var length = 1;
      while (true) {
        var pattern = text1.substring(text_length - length);
        var found = text2.indexOf(pattern);
        if (found == -1) {
          return best;
        }
        length += found;
        if (found == 0 || text1.substring(text_length - length) == text2.substring(0, length)) {
          best = length;
          length++;
        }
      }
    };
    diff_match_patch2.prototype.diff_halfMatch_ = function(text1, text2) {
      if (this.Diff_Timeout <= 0) {
        return null;
      }
      var longtext = text1.length > text2.length ? text1 : text2;
      var shorttext = text1.length > text2.length ? text2 : text1;
      if (longtext.length < 4 || shorttext.length * 2 < longtext.length) {
        return null;
      }
      var dmp = this;
      function diff_halfMatchI_(longtext2, shorttext2, i) {
        var seed = longtext2.substring(i, i + Math.floor(longtext2.length / 4));
        var j = -1;
        var best_common = "";
        var best_longtext_a, best_longtext_b, best_shorttext_a, best_shorttext_b;
        while ((j = shorttext2.indexOf(seed, j + 1)) != -1) {
          var prefixLength = dmp.diff_commonPrefix(
            longtext2.substring(i),
            shorttext2.substring(j)
          );
          var suffixLength = dmp.diff_commonSuffix(
            longtext2.substring(0, i),
            shorttext2.substring(0, j)
          );
          if (best_common.length < suffixLength + prefixLength) {
            best_common = shorttext2.substring(j - suffixLength, j) + shorttext2.substring(j, j + prefixLength);
            best_longtext_a = longtext2.substring(0, i - suffixLength);
            best_longtext_b = longtext2.substring(i + prefixLength);
            best_shorttext_a = shorttext2.substring(0, j - suffixLength);
            best_shorttext_b = shorttext2.substring(j + prefixLength);
          }
        }
        if (best_common.length * 2 >= longtext2.length) {
          return [
            best_longtext_a,
            best_longtext_b,
            best_shorttext_a,
            best_shorttext_b,
            best_common
          ];
        } else {
          return null;
        }
      }
      var hm1 = diff_halfMatchI_(
        longtext,
        shorttext,
        Math.ceil(longtext.length / 4)
      );
      var hm2 = diff_halfMatchI_(
        longtext,
        shorttext,
        Math.ceil(longtext.length / 2)
      );
      var hm;
      if (!hm1 && !hm2) {
        return null;
      } else if (!hm2) {
        hm = hm1;
      } else if (!hm1) {
        hm = hm2;
      } else {
        hm = hm1[4].length > hm2[4].length ? hm1 : hm2;
      }
      var text1_a, text1_b, text2_a, text2_b;
      if (text1.length > text2.length) {
        text1_a = hm[0];
        text1_b = hm[1];
        text2_a = hm[2];
        text2_b = hm[3];
      } else {
        text2_a = hm[0];
        text2_b = hm[1];
        text1_a = hm[2];
        text1_b = hm[3];
      }
      var mid_common = hm[4];
      return [text1_a, text1_b, text2_a, text2_b, mid_common];
    };
    diff_match_patch2.prototype.diff_cleanupSemantic = function(diffs) {
      var changes = false;
      var equalities = [];
      var equalitiesLength = 0;
      var lastEquality = null;
      var pointer = 0;
      var length_insertions1 = 0;
      var length_deletions1 = 0;
      var length_insertions2 = 0;
      var length_deletions2 = 0;
      while (pointer < diffs.length) {
        if (diffs[pointer][0] == DIFF_EQUAL) {
          equalities[equalitiesLength++] = pointer;
          length_insertions1 = length_insertions2;
          length_deletions1 = length_deletions2;
          length_insertions2 = 0;
          length_deletions2 = 0;
          lastEquality = diffs[pointer][1];
        } else {
          if (diffs[pointer][0] == DIFF_INSERT) {
            length_insertions2 += diffs[pointer][1].length;
          } else {
            length_deletions2 += diffs[pointer][1].length;
          }
          if (lastEquality && lastEquality.length <= Math.max(length_insertions1, length_deletions1) && lastEquality.length <= Math.max(
            length_insertions2,
            length_deletions2
          )) {
            diffs.splice(
              equalities[equalitiesLength - 1],
              0,
              new diff_match_patch2.Diff(DIFF_DELETE, lastEquality)
            );
            diffs[equalities[equalitiesLength - 1] + 1][0] = DIFF_INSERT;
            equalitiesLength--;
            equalitiesLength--;
            pointer = equalitiesLength > 0 ? equalities[equalitiesLength - 1] : -1;
            length_insertions1 = 0;
            length_deletions1 = 0;
            length_insertions2 = 0;
            length_deletions2 = 0;
            lastEquality = null;
            changes = true;
          }
        }
        pointer++;
      }
      if (changes) {
        this.diff_cleanupMerge(diffs);
      }
      this.diff_cleanupSemanticLossless(diffs);
      pointer = 1;
      while (pointer < diffs.length) {
        if (diffs[pointer - 1][0] == DIFF_DELETE && diffs[pointer][0] == DIFF_INSERT) {
          var deletion = diffs[pointer - 1][1];
          var insertion = diffs[pointer][1];
          var overlap_length1 = this.diff_commonOverlap_(deletion, insertion);
          var overlap_length2 = this.diff_commonOverlap_(insertion, deletion);
          if (overlap_length1 >= overlap_length2) {
            if (overlap_length1 >= deletion.length / 2 || overlap_length1 >= insertion.length / 2) {
              diffs.splice(pointer, 0, new diff_match_patch2.Diff(
                DIFF_EQUAL,
                insertion.substring(0, overlap_length1)
              ));
              diffs[pointer - 1][1] = deletion.substring(0, deletion.length - overlap_length1);
              diffs[pointer + 1][1] = insertion.substring(overlap_length1);
              pointer++;
            }
          } else {
            if (overlap_length2 >= deletion.length / 2 || overlap_length2 >= insertion.length / 2) {
              diffs.splice(pointer, 0, new diff_match_patch2.Diff(
                DIFF_EQUAL,
                deletion.substring(0, overlap_length2)
              ));
              diffs[pointer - 1][0] = DIFF_INSERT;
              diffs[pointer - 1][1] = insertion.substring(0, insertion.length - overlap_length2);
              diffs[pointer + 1][0] = DIFF_DELETE;
              diffs[pointer + 1][1] = deletion.substring(overlap_length2);
              pointer++;
            }
          }
          pointer++;
        }
        pointer++;
      }
    };
    diff_match_patch2.prototype.diff_cleanupSemanticLossless = function(diffs) {
      function diff_cleanupSemanticScore_(one, two) {
        if (!one || !two) {
          return 6;
        }
        var char1 = one.charAt(one.length - 1);
        var char2 = two.charAt(0);
        var nonAlphaNumeric1 = char1.match(diff_match_patch2.nonAlphaNumericRegex_);
        var nonAlphaNumeric2 = char2.match(diff_match_patch2.nonAlphaNumericRegex_);
        var whitespace1 = nonAlphaNumeric1 && char1.match(diff_match_patch2.whitespaceRegex_);
        var whitespace2 = nonAlphaNumeric2 && char2.match(diff_match_patch2.whitespaceRegex_);
        var lineBreak1 = whitespace1 && char1.match(diff_match_patch2.linebreakRegex_);
        var lineBreak2 = whitespace2 && char2.match(diff_match_patch2.linebreakRegex_);
        var blankLine1 = lineBreak1 && one.match(diff_match_patch2.blanklineEndRegex_);
        var blankLine2 = lineBreak2 && two.match(diff_match_patch2.blanklineStartRegex_);
        if (blankLine1 || blankLine2) {
          return 5;
        } else if (lineBreak1 || lineBreak2) {
          return 4;
        } else if (nonAlphaNumeric1 && !whitespace1 && whitespace2) {
          return 3;
        } else if (whitespace1 || whitespace2) {
          return 2;
        } else if (nonAlphaNumeric1 || nonAlphaNumeric2) {
          return 1;
        }
        return 0;
      }
      var pointer = 1;
      while (pointer < diffs.length - 1) {
        if (diffs[pointer - 1][0] == DIFF_EQUAL && diffs[pointer + 1][0] == DIFF_EQUAL) {
          var equality1 = diffs[pointer - 1][1];
          var edit = diffs[pointer][1];
          var equality2 = diffs[pointer + 1][1];
          var commonOffset = this.diff_commonSuffix(equality1, edit);
          if (commonOffset) {
            var commonString = edit.substring(edit.length - commonOffset);
            equality1 = equality1.substring(0, equality1.length - commonOffset);
            edit = commonString + edit.substring(0, edit.length - commonOffset);
            equality2 = commonString + equality2;
          }
          var bestEquality1 = equality1;
          var bestEdit = edit;
          var bestEquality2 = equality2;
          var bestScore = diff_cleanupSemanticScore_(equality1, edit) + diff_cleanupSemanticScore_(edit, equality2);
          while (edit.charAt(0) === equality2.charAt(0)) {
            equality1 += edit.charAt(0);
            edit = edit.substring(1) + equality2.charAt(0);
            equality2 = equality2.substring(1);
            var score = diff_cleanupSemanticScore_(equality1, edit) + diff_cleanupSemanticScore_(edit, equality2);
            if (score >= bestScore) {
              bestScore = score;
              bestEquality1 = equality1;
              bestEdit = edit;
              bestEquality2 = equality2;
            }
          }
          if (diffs[pointer - 1][1] != bestEquality1) {
            if (bestEquality1) {
              diffs[pointer - 1][1] = bestEquality1;
            } else {
              diffs.splice(pointer - 1, 1);
              pointer--;
            }
            diffs[pointer][1] = bestEdit;
            if (bestEquality2) {
              diffs[pointer + 1][1] = bestEquality2;
            } else {
              diffs.splice(pointer + 1, 1);
              pointer--;
            }
          }
        }
        pointer++;
      }
    };
    diff_match_patch2.nonAlphaNumericRegex_ = /[^a-zA-Z0-9]/;
    diff_match_patch2.whitespaceRegex_ = /\s/;
    diff_match_patch2.linebreakRegex_ = /[\r\n]/;
    diff_match_patch2.blanklineEndRegex_ = /\n\r?\n$/;
    diff_match_patch2.blanklineStartRegex_ = /^\r?\n\r?\n/;
    diff_match_patch2.prototype.diff_cleanupEfficiency = function(diffs) {
      var changes = false;
      var equalities = [];
      var equalitiesLength = 0;
      var lastEquality = null;
      var pointer = 0;
      var pre_ins = false;
      var pre_del = false;
      var post_ins = false;
      var post_del = false;
      while (pointer < diffs.length) {
        if (diffs[pointer][0] == DIFF_EQUAL) {
          if (diffs[pointer][1].length < this.Diff_EditCost && (post_ins || post_del)) {
            equalities[equalitiesLength++] = pointer;
            pre_ins = post_ins;
            pre_del = post_del;
            lastEquality = diffs[pointer][1];
          } else {
            equalitiesLength = 0;
            lastEquality = null;
          }
          post_ins = post_del = false;
        } else {
          if (diffs[pointer][0] == DIFF_DELETE) {
            post_del = true;
          } else {
            post_ins = true;
          }
          if (lastEquality && (pre_ins && pre_del && post_ins && post_del || lastEquality.length < this.Diff_EditCost / 2 && pre_ins + pre_del + post_ins + post_del == 3)) {
            diffs.splice(
              equalities[equalitiesLength - 1],
              0,
              new diff_match_patch2.Diff(DIFF_DELETE, lastEquality)
            );
            diffs[equalities[equalitiesLength - 1] + 1][0] = DIFF_INSERT;
            equalitiesLength--;
            lastEquality = null;
            if (pre_ins && pre_del) {
              post_ins = post_del = true;
              equalitiesLength = 0;
            } else {
              equalitiesLength--;
              pointer = equalitiesLength > 0 ? equalities[equalitiesLength - 1] : -1;
              post_ins = post_del = false;
            }
            changes = true;
          }
        }
        pointer++;
      }
      if (changes) {
        this.diff_cleanupMerge(diffs);
      }
    };
    diff_match_patch2.prototype.diff_cleanupMerge = function(diffs) {
      diffs.push(new diff_match_patch2.Diff(DIFF_EQUAL, ""));
      var pointer = 0;
      var count_delete = 0;
      var count_insert = 0;
      var text_delete = "";
      var text_insert = "";
      var commonlength;
      while (pointer < diffs.length) {
        switch (diffs[pointer][0]) {
          case DIFF_INSERT:
            count_insert++;
            text_insert += diffs[pointer][1];
            pointer++;
            break;
          case DIFF_DELETE:
            count_delete++;
            text_delete += diffs[pointer][1];
            pointer++;
            break;
          case DIFF_EQUAL:
            if (count_delete + count_insert > 1) {
              if (count_delete !== 0 && count_insert !== 0) {
                commonlength = this.diff_commonPrefix(text_insert, text_delete);
                if (commonlength !== 0) {
                  if (pointer - count_delete - count_insert > 0 && diffs[pointer - count_delete - count_insert - 1][0] == DIFF_EQUAL) {
                    diffs[pointer - count_delete - count_insert - 1][1] += text_insert.substring(0, commonlength);
                  } else {
                    diffs.splice(0, 0, new diff_match_patch2.Diff(
                      DIFF_EQUAL,
                      text_insert.substring(0, commonlength)
                    ));
                    pointer++;
                  }
                  text_insert = text_insert.substring(commonlength);
                  text_delete = text_delete.substring(commonlength);
                }
                commonlength = this.diff_commonSuffix(text_insert, text_delete);
                if (commonlength !== 0) {
                  diffs[pointer][1] = text_insert.substring(text_insert.length - commonlength) + diffs[pointer][1];
                  text_insert = text_insert.substring(0, text_insert.length - commonlength);
                  text_delete = text_delete.substring(0, text_delete.length - commonlength);
                }
              }
              pointer -= count_delete + count_insert;
              diffs.splice(pointer, count_delete + count_insert);
              if (text_delete.length) {
                diffs.splice(
                  pointer,
                  0,
                  new diff_match_patch2.Diff(DIFF_DELETE, text_delete)
                );
                pointer++;
              }
              if (text_insert.length) {
                diffs.splice(
                  pointer,
                  0,
                  new diff_match_patch2.Diff(DIFF_INSERT, text_insert)
                );
                pointer++;
              }
              pointer++;
            } else if (pointer !== 0 && diffs[pointer - 1][0] == DIFF_EQUAL) {
              diffs[pointer - 1][1] += diffs[pointer][1];
              diffs.splice(pointer, 1);
            } else {
              pointer++;
            }
            count_insert = 0;
            count_delete = 0;
            text_delete = "";
            text_insert = "";
            break;
        }
      }
      if (diffs[diffs.length - 1][1] === "") {
        diffs.pop();
      }
      var changes = false;
      pointer = 1;
      while (pointer < diffs.length - 1) {
        if (diffs[pointer - 1][0] == DIFF_EQUAL && diffs[pointer + 1][0] == DIFF_EQUAL) {
          if (diffs[pointer][1].substring(diffs[pointer][1].length - diffs[pointer - 1][1].length) == diffs[pointer - 1][1]) {
            diffs[pointer][1] = diffs[pointer - 1][1] + diffs[pointer][1].substring(0, diffs[pointer][1].length - diffs[pointer - 1][1].length);
            diffs[pointer + 1][1] = diffs[pointer - 1][1] + diffs[pointer + 1][1];
            diffs.splice(pointer - 1, 1);
            changes = true;
          } else if (diffs[pointer][1].substring(0, diffs[pointer + 1][1].length) == diffs[pointer + 1][1]) {
            diffs[pointer - 1][1] += diffs[pointer + 1][1];
            diffs[pointer][1] = diffs[pointer][1].substring(diffs[pointer + 1][1].length) + diffs[pointer + 1][1];
            diffs.splice(pointer + 1, 1);
            changes = true;
          }
        }
        pointer++;
      }
      if (changes) {
        this.diff_cleanupMerge(diffs);
      }
    };
    diff_match_patch2.prototype.diff_xIndex = function(diffs, loc) {
      var chars1 = 0;
      var chars2 = 0;
      var last_chars1 = 0;
      var last_chars2 = 0;
      var x;
      for (x = 0; x < diffs.length; x++) {
        if (diffs[x][0] !== DIFF_INSERT) {
          chars1 += diffs[x][1].length;
        }
        if (diffs[x][0] !== DIFF_DELETE) {
          chars2 += diffs[x][1].length;
        }
        if (chars1 > loc) {
          break;
        }
        last_chars1 = chars1;
        last_chars2 = chars2;
      }
      if (diffs.length != x && diffs[x][0] === DIFF_DELETE) {
        return last_chars2;
      }
      return last_chars2 + (loc - last_chars1);
    };
    diff_match_patch2.prototype.diff_prettyHtml = function(diffs) {
      var html = [];
      var pattern_amp = /&/g;
      var pattern_lt = /</g;
      var pattern_gt = />/g;
      var pattern_para = /\n/g;
      for (var x = 0; x < diffs.length; x++) {
        var op = diffs[x][0];
        var data = diffs[x][1];
        var text = data.replace(pattern_amp, "&amp;").replace(pattern_lt, "&lt;").replace(pattern_gt, "&gt;").replace(pattern_para, "&para;<br>");
        switch (op) {
          case DIFF_INSERT:
            html[x] = '<ins style="background:#e6ffe6;">' + text + "</ins>";
            break;
          case DIFF_DELETE:
            html[x] = '<del style="background:#ffe6e6;">' + text + "</del>";
            break;
          case DIFF_EQUAL:
            html[x] = "<span>" + text + "</span>";
            break;
        }
      }
      return html.join("");
    };
    diff_match_patch2.prototype.diff_text1 = function(diffs) {
      var text = [];
      for (var x = 0; x < diffs.length; x++) {
        if (diffs[x][0] !== DIFF_INSERT) {
          text[x] = diffs[x][1];
        }
      }
      return text.join("");
    };
    diff_match_patch2.prototype.diff_text2 = function(diffs) {
      var text = [];
      for (var x = 0; x < diffs.length; x++) {
        if (diffs[x][0] !== DIFF_DELETE) {
          text[x] = diffs[x][1];
        }
      }
      return text.join("");
    };
    diff_match_patch2.prototype.diff_levenshtein = function(diffs) {
      var levenshtein = 0;
      var insertions = 0;
      var deletions = 0;
      for (var x = 0; x < diffs.length; x++) {
        var op = diffs[x][0];
        var data = diffs[x][1];
        switch (op) {
          case DIFF_INSERT:
            insertions += data.length;
            break;
          case DIFF_DELETE:
            deletions += data.length;
            break;
          case DIFF_EQUAL:
            levenshtein += Math.max(insertions, deletions);
            insertions = 0;
            deletions = 0;
            break;
        }
      }
      levenshtein += Math.max(insertions, deletions);
      return levenshtein;
    };
    diff_match_patch2.prototype.diff_toDelta = function(diffs) {
      var text = [];
      for (var x = 0; x < diffs.length; x++) {
        switch (diffs[x][0]) {
          case DIFF_INSERT:
            text[x] = "+" + encodeURI(diffs[x][1]);
            break;
          case DIFF_DELETE:
            text[x] = "-" + diffs[x][1].length;
            break;
          case DIFF_EQUAL:
            text[x] = "=" + diffs[x][1].length;
            break;
        }
      }
      return text.join("	").replace(/%20/g, " ");
    };
    diff_match_patch2.prototype.diff_fromDelta = function(text1, delta) {
      var diffs = [];
      var diffsLength = 0;
      var pointer = 0;
      var tokens = delta.split(/\t/g);
      for (var x = 0; x < tokens.length; x++) {
        var param = tokens[x].substring(1);
        switch (tokens[x].charAt(0)) {
          case "+":
            try {
              diffs[diffsLength++] = new diff_match_patch2.Diff(DIFF_INSERT, decodeURI(param));
            } catch (ex) {
              throw new Error("Illegal escape in diff_fromDelta: " + param);
            }
            break;
          case "-":
          // Fall through.
          case "=":
            var n = parseInt(param, 10);
            if (isNaN(n) || n < 0) {
              throw new Error("Invalid number in diff_fromDelta: " + param);
            }
            var text = text1.substring(pointer, pointer += n);
            if (tokens[x].charAt(0) == "=") {
              diffs[diffsLength++] = new diff_match_patch2.Diff(DIFF_EQUAL, text);
            } else {
              diffs[diffsLength++] = new diff_match_patch2.Diff(DIFF_DELETE, text);
            }
            break;
          default:
            if (tokens[x]) {
              throw new Error("Invalid diff operation in diff_fromDelta: " + tokens[x]);
            }
        }
      }
      if (pointer != text1.length) {
        throw new Error("Delta length (" + pointer + ") does not equal source text length (" + text1.length + ").");
      }
      return diffs;
    };
    diff_match_patch2.prototype.match_main = function(text, pattern, loc) {
      if (text == null || pattern == null || loc == null) {
        throw new Error("Null input. (match_main)");
      }
      loc = Math.max(0, Math.min(loc, text.length));
      if (text == pattern) {
        return 0;
      } else if (!text.length) {
        return -1;
      } else if (text.substring(loc, loc + pattern.length) == pattern) {
        return loc;
      } else {
        return this.match_bitap_(text, pattern, loc);
      }
    };
    diff_match_patch2.prototype.match_bitap_ = function(text, pattern, loc) {
      if (pattern.length > this.Match_MaxBits) {
        throw new Error("Pattern too long for this browser.");
      }
      var s = this.match_alphabet_(pattern);
      var dmp = this;
      function match_bitapScore_(e, x) {
        var accuracy = e / pattern.length;
        var proximity = Math.abs(loc - x);
        if (!dmp.Match_Distance) {
          return proximity ? 1 : accuracy;
        }
        return accuracy + proximity / dmp.Match_Distance;
      }
      var score_threshold = this.Match_Threshold;
      var best_loc = text.indexOf(pattern, loc);
      if (best_loc != -1) {
        score_threshold = Math.min(match_bitapScore_(0, best_loc), score_threshold);
        best_loc = text.lastIndexOf(pattern, loc + pattern.length);
        if (best_loc != -1) {
          score_threshold = Math.min(match_bitapScore_(0, best_loc), score_threshold);
        }
      }
      var matchmask = 1 << pattern.length - 1;
      best_loc = -1;
      var bin_min, bin_mid;
      var bin_max = pattern.length + text.length;
      var last_rd;
      for (var d = 0; d < pattern.length; d++) {
        bin_min = 0;
        bin_mid = bin_max;
        while (bin_min < bin_mid) {
          if (match_bitapScore_(d, loc + bin_mid) <= score_threshold) {
            bin_min = bin_mid;
          } else {
            bin_max = bin_mid;
          }
          bin_mid = Math.floor((bin_max - bin_min) / 2 + bin_min);
        }
        bin_max = bin_mid;
        var start = Math.max(1, loc - bin_mid + 1);
        var finish = Math.min(loc + bin_mid, text.length) + pattern.length;
        var rd = Array(finish + 2);
        rd[finish + 1] = (1 << d) - 1;
        for (var j = finish; j >= start; j--) {
          var charMatch = s[text.charAt(j - 1)];
          if (d === 0) {
            rd[j] = (rd[j + 1] << 1 | 1) & charMatch;
          } else {
            rd[j] = (rd[j + 1] << 1 | 1) & charMatch | ((last_rd[j + 1] | last_rd[j]) << 1 | 1) | last_rd[j + 1];
          }
          if (rd[j] & matchmask) {
            var score = match_bitapScore_(d, j - 1);
            if (score <= score_threshold) {
              score_threshold = score;
              best_loc = j - 1;
              if (best_loc > loc) {
                start = Math.max(1, 2 * loc - best_loc);
              } else {
                break;
              }
            }
          }
        }
        if (match_bitapScore_(d + 1, loc) > score_threshold) {
          break;
        }
        last_rd = rd;
      }
      return best_loc;
    };
    diff_match_patch2.prototype.match_alphabet_ = function(pattern) {
      var s = {};
      for (var i = 0; i < pattern.length; i++) {
        s[pattern.charAt(i)] = 0;
      }
      for (var i = 0; i < pattern.length; i++) {
        s[pattern.charAt(i)] |= 1 << pattern.length - i - 1;
      }
      return s;
    };
    diff_match_patch2.prototype.patch_addContext_ = function(patch, text) {
      if (text.length == 0) {
        return;
      }
      if (patch.start2 === null) {
        throw Error("patch not initialized");
      }
      var pattern = text.substring(patch.start2, patch.start2 + patch.length1);
      var padding = 0;
      while (text.indexOf(pattern) != text.lastIndexOf(pattern) && pattern.length < this.Match_MaxBits - this.Patch_Margin - this.Patch_Margin) {
        padding += this.Patch_Margin;
        pattern = text.substring(
          patch.start2 - padding,
          patch.start2 + patch.length1 + padding
        );
      }
      padding += this.Patch_Margin;
      var prefix = text.substring(patch.start2 - padding, patch.start2);
      if (prefix) {
        patch.diffs.unshift(new diff_match_patch2.Diff(DIFF_EQUAL, prefix));
      }
      var suffix = text.substring(
        patch.start2 + patch.length1,
        patch.start2 + patch.length1 + padding
      );
      if (suffix) {
        patch.diffs.push(new diff_match_patch2.Diff(DIFF_EQUAL, suffix));
      }
      patch.start1 -= prefix.length;
      patch.start2 -= prefix.length;
      patch.length1 += prefix.length + suffix.length;
      patch.length2 += prefix.length + suffix.length;
    };
    diff_match_patch2.prototype.patch_make = function(a, opt_b, opt_c) {
      var text1, diffs;
      if (typeof a == "string" && typeof opt_b == "string" && typeof opt_c == "undefined") {
        text1 = /** @type {string} */
        a;
        diffs = this.diff_main(
          text1,
          /** @type {string} */
          opt_b,
          true
        );
        if (diffs.length > 2) {
          this.diff_cleanupSemantic(diffs);
          this.diff_cleanupEfficiency(diffs);
        }
      } else if (a && typeof a == "object" && typeof opt_b == "undefined" && typeof opt_c == "undefined") {
        diffs = /** @type {!Array.<!diff_match_patch.Diff>} */
        a;
        text1 = this.diff_text1(diffs);
      } else if (typeof a == "string" && opt_b && typeof opt_b == "object" && typeof opt_c == "undefined") {
        text1 = /** @type {string} */
        a;
        diffs = /** @type {!Array.<!diff_match_patch.Diff>} */
        opt_b;
      } else if (typeof a == "string" && typeof opt_b == "string" && opt_c && typeof opt_c == "object") {
        text1 = /** @type {string} */
        a;
        diffs = /** @type {!Array.<!diff_match_patch.Diff>} */
        opt_c;
      } else {
        throw new Error("Unknown call format to patch_make.");
      }
      if (diffs.length === 0) {
        return [];
      }
      var patches = [];
      var patch = new diff_match_patch2.patch_obj();
      var patchDiffLength = 0;
      var char_count1 = 0;
      var char_count2 = 0;
      var prepatch_text = text1;
      var postpatch_text = text1;
      for (var x = 0; x < diffs.length; x++) {
        var diff_type = diffs[x][0];
        var diff_text = diffs[x][1];
        if (!patchDiffLength && diff_type !== DIFF_EQUAL) {
          patch.start1 = char_count1;
          patch.start2 = char_count2;
        }
        switch (diff_type) {
          case DIFF_INSERT:
            patch.diffs[patchDiffLength++] = diffs[x];
            patch.length2 += diff_text.length;
            postpatch_text = postpatch_text.substring(0, char_count2) + diff_text + postpatch_text.substring(char_count2);
            break;
          case DIFF_DELETE:
            patch.length1 += diff_text.length;
            patch.diffs[patchDiffLength++] = diffs[x];
            postpatch_text = postpatch_text.substring(0, char_count2) + postpatch_text.substring(char_count2 + diff_text.length);
            break;
          case DIFF_EQUAL:
            if (diff_text.length <= 2 * this.Patch_Margin && patchDiffLength && diffs.length != x + 1) {
              patch.diffs[patchDiffLength++] = diffs[x];
              patch.length1 += diff_text.length;
              patch.length2 += diff_text.length;
            } else if (diff_text.length >= 2 * this.Patch_Margin) {
              if (patchDiffLength) {
                this.patch_addContext_(patch, prepatch_text);
                patches.push(patch);
                patch = new diff_match_patch2.patch_obj();
                patchDiffLength = 0;
                prepatch_text = postpatch_text;
                char_count1 = char_count2;
              }
            }
            break;
        }
        if (diff_type !== DIFF_INSERT) {
          char_count1 += diff_text.length;
        }
        if (diff_type !== DIFF_DELETE) {
          char_count2 += diff_text.length;
        }
      }
      if (patchDiffLength) {
        this.patch_addContext_(patch, prepatch_text);
        patches.push(patch);
      }
      return patches;
    };
    diff_match_patch2.prototype.patch_deepCopy = function(patches) {
      var patchesCopy = [];
      for (var x = 0; x < patches.length; x++) {
        var patch = patches[x];
        var patchCopy = new diff_match_patch2.patch_obj();
        patchCopy.diffs = [];
        for (var y = 0; y < patch.diffs.length; y++) {
          patchCopy.diffs[y] = new diff_match_patch2.Diff(patch.diffs[y][0], patch.diffs[y][1]);
        }
        patchCopy.start1 = patch.start1;
        patchCopy.start2 = patch.start2;
        patchCopy.length1 = patch.length1;
        patchCopy.length2 = patch.length2;
        patchesCopy[x] = patchCopy;
      }
      return patchesCopy;
    };
    diff_match_patch2.prototype.patch_apply = function(patches, text) {
      if (patches.length == 0) {
        return [text, []];
      }
      patches = this.patch_deepCopy(patches);
      var nullPadding = this.patch_addPadding(patches);
      text = nullPadding + text + nullPadding;
      this.patch_splitMax(patches);
      var delta = 0;
      var results = [];
      for (var x = 0; x < patches.length; x++) {
        var expected_loc = patches[x].start2 + delta;
        var text1 = this.diff_text1(patches[x].diffs);
        var start_loc;
        var end_loc = -1;
        if (text1.length > this.Match_MaxBits) {
          start_loc = this.match_main(
            text,
            text1.substring(0, this.Match_MaxBits),
            expected_loc
          );
          if (start_loc != -1) {
            end_loc = this.match_main(
              text,
              text1.substring(text1.length - this.Match_MaxBits),
              expected_loc + text1.length - this.Match_MaxBits
            );
            if (end_loc == -1 || start_loc >= end_loc) {
              start_loc = -1;
            }
          }
        } else {
          start_loc = this.match_main(text, text1, expected_loc);
        }
        if (start_loc == -1) {
          results[x] = false;
          delta -= patches[x].length2 - patches[x].length1;
        } else {
          results[x] = true;
          delta = start_loc - expected_loc;
          var text2;
          if (end_loc == -1) {
            text2 = text.substring(start_loc, start_loc + text1.length);
          } else {
            text2 = text.substring(start_loc, end_loc + this.Match_MaxBits);
          }
          if (text1 == text2) {
            text = text.substring(0, start_loc) + this.diff_text2(patches[x].diffs) + text.substring(start_loc + text1.length);
          } else {
            var diffs = this.diff_main(text1, text2, false);
            if (text1.length > this.Match_MaxBits && this.diff_levenshtein(diffs) / text1.length > this.Patch_DeleteThreshold) {
              results[x] = false;
            } else {
              this.diff_cleanupSemanticLossless(diffs);
              var index1 = 0;
              var index2;
              for (var y = 0; y < patches[x].diffs.length; y++) {
                var mod = patches[x].diffs[y];
                if (mod[0] !== DIFF_EQUAL) {
                  index2 = this.diff_xIndex(diffs, index1);
                }
                if (mod[0] === DIFF_INSERT) {
                  text = text.substring(0, start_loc + index2) + mod[1] + text.substring(start_loc + index2);
                } else if (mod[0] === DIFF_DELETE) {
                  text = text.substring(0, start_loc + index2) + text.substring(start_loc + this.diff_xIndex(
                    diffs,
                    index1 + mod[1].length
                  ));
                }
                if (mod[0] !== DIFF_DELETE) {
                  index1 += mod[1].length;
                }
              }
            }
          }
        }
      }
      text = text.substring(nullPadding.length, text.length - nullPadding.length);
      return [text, results];
    };
    diff_match_patch2.prototype.patch_addPadding = function(patches) {
      var paddingLength = this.Patch_Margin;
      var nullPadding = "";
      for (var x = 1; x <= paddingLength; x++) {
        nullPadding += String.fromCharCode(x);
      }
      for (var x = 0; x < patches.length; x++) {
        patches[x].start1 += paddingLength;
        patches[x].start2 += paddingLength;
      }
      var patch = patches[0];
      var diffs = patch.diffs;
      if (diffs.length == 0 || diffs[0][0] != DIFF_EQUAL) {
        diffs.unshift(new diff_match_patch2.Diff(DIFF_EQUAL, nullPadding));
        patch.start1 -= paddingLength;
        patch.start2 -= paddingLength;
        patch.length1 += paddingLength;
        patch.length2 += paddingLength;
      } else if (paddingLength > diffs[0][1].length) {
        var extraLength = paddingLength - diffs[0][1].length;
        diffs[0][1] = nullPadding.substring(diffs[0][1].length) + diffs[0][1];
        patch.start1 -= extraLength;
        patch.start2 -= extraLength;
        patch.length1 += extraLength;
        patch.length2 += extraLength;
      }
      patch = patches[patches.length - 1];
      diffs = patch.diffs;
      if (diffs.length == 0 || diffs[diffs.length - 1][0] != DIFF_EQUAL) {
        diffs.push(new diff_match_patch2.Diff(DIFF_EQUAL, nullPadding));
        patch.length1 += paddingLength;
        patch.length2 += paddingLength;
      } else if (paddingLength > diffs[diffs.length - 1][1].length) {
        var extraLength = paddingLength - diffs[diffs.length - 1][1].length;
        diffs[diffs.length - 1][1] += nullPadding.substring(0, extraLength);
        patch.length1 += extraLength;
        patch.length2 += extraLength;
      }
      return nullPadding;
    };
    diff_match_patch2.prototype.patch_splitMax = function(patches) {
      var patch_size = this.Match_MaxBits;
      for (var x = 0; x < patches.length; x++) {
        if (patches[x].length1 <= patch_size) {
          continue;
        }
        var bigpatch = patches[x];
        patches.splice(x--, 1);
        var start1 = bigpatch.start1;
        var start2 = bigpatch.start2;
        var precontext = "";
        while (bigpatch.diffs.length !== 0) {
          var patch = new diff_match_patch2.patch_obj();
          var empty = true;
          patch.start1 = start1 - precontext.length;
          patch.start2 = start2 - precontext.length;
          if (precontext !== "") {
            patch.length1 = patch.length2 = precontext.length;
            patch.diffs.push(new diff_match_patch2.Diff(DIFF_EQUAL, precontext));
          }
          while (bigpatch.diffs.length !== 0 && patch.length1 < patch_size - this.Patch_Margin) {
            var diff_type = bigpatch.diffs[0][0];
            var diff_text = bigpatch.diffs[0][1];
            if (diff_type === DIFF_INSERT) {
              patch.length2 += diff_text.length;
              start2 += diff_text.length;
              patch.diffs.push(bigpatch.diffs.shift());
              empty = false;
            } else if (diff_type === DIFF_DELETE && patch.diffs.length == 1 && patch.diffs[0][0] == DIFF_EQUAL && diff_text.length > 2 * patch_size) {
              patch.length1 += diff_text.length;
              start1 += diff_text.length;
              empty = false;
              patch.diffs.push(new diff_match_patch2.Diff(diff_type, diff_text));
              bigpatch.diffs.shift();
            } else {
              diff_text = diff_text.substring(
                0,
                patch_size - patch.length1 - this.Patch_Margin
              );
              patch.length1 += diff_text.length;
              start1 += diff_text.length;
              if (diff_type === DIFF_EQUAL) {
                patch.length2 += diff_text.length;
                start2 += diff_text.length;
              } else {
                empty = false;
              }
              patch.diffs.push(new diff_match_patch2.Diff(diff_type, diff_text));
              if (diff_text == bigpatch.diffs[0][1]) {
                bigpatch.diffs.shift();
              } else {
                bigpatch.diffs[0][1] = bigpatch.diffs[0][1].substring(diff_text.length);
              }
            }
          }
          precontext = this.diff_text2(patch.diffs);
          precontext = precontext.substring(precontext.length - this.Patch_Margin);
          var postcontext = this.diff_text1(bigpatch.diffs).substring(0, this.Patch_Margin);
          if (postcontext !== "") {
            patch.length1 += postcontext.length;
            patch.length2 += postcontext.length;
            if (patch.diffs.length !== 0 && patch.diffs[patch.diffs.length - 1][0] === DIFF_EQUAL) {
              patch.diffs[patch.diffs.length - 1][1] += postcontext;
            } else {
              patch.diffs.push(new diff_match_patch2.Diff(DIFF_EQUAL, postcontext));
            }
          }
          if (!empty) {
            patches.splice(++x, 0, patch);
          }
        }
      }
    };
    diff_match_patch2.prototype.patch_toText = function(patches) {
      var text = [];
      for (var x = 0; x < patches.length; x++) {
        text[x] = patches[x];
      }
      return text.join("");
    };
    diff_match_patch2.prototype.patch_fromText = function(textline) {
      var patches = [];
      if (!textline) {
        return patches;
      }
      var text = textline.split("\n");
      var textPointer = 0;
      var patchHeader = /^@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@$/;
      while (textPointer < text.length) {
        var m = text[textPointer].match(patchHeader);
        if (!m) {
          throw new Error("Invalid patch string: " + text[textPointer]);
        }
        var patch = new diff_match_patch2.patch_obj();
        patches.push(patch);
        patch.start1 = parseInt(m[1], 10);
        if (m[2] === "") {
          patch.start1--;
          patch.length1 = 1;
        } else if (m[2] == "0") {
          patch.length1 = 0;
        } else {
          patch.start1--;
          patch.length1 = parseInt(m[2], 10);
        }
        patch.start2 = parseInt(m[3], 10);
        if (m[4] === "") {
          patch.start2--;
          patch.length2 = 1;
        } else if (m[4] == "0") {
          patch.length2 = 0;
        } else {
          patch.start2--;
          patch.length2 = parseInt(m[4], 10);
        }
        textPointer++;
        while (textPointer < text.length) {
          var sign = text[textPointer].charAt(0);
          try {
            var line = decodeURI(text[textPointer].substring(1));
          } catch (ex) {
            throw new Error("Illegal escape in patch_fromText: " + line);
          }
          if (sign == "-") {
            patch.diffs.push(new diff_match_patch2.Diff(DIFF_DELETE, line));
          } else if (sign == "+") {
            patch.diffs.push(new diff_match_patch2.Diff(DIFF_INSERT, line));
          } else if (sign == " ") {
            patch.diffs.push(new diff_match_patch2.Diff(DIFF_EQUAL, line));
          } else if (sign == "@") {
            break;
          } else if (sign === "") {
          } else {
            throw new Error('Invalid patch mode "' + sign + '" in: ' + line);
          }
          textPointer++;
        }
      }
      return patches;
    };
    diff_match_patch2.patch_obj = function() {
      this.diffs = [];
      this.start1 = null;
      this.start2 = null;
      this.length1 = 0;
      this.length2 = 0;
    };
    diff_match_patch2.patch_obj.prototype.toString = function() {
      var coords1, coords2;
      if (this.length1 === 0) {
        coords1 = this.start1 + ",0";
      } else if (this.length1 == 1) {
        coords1 = this.start1 + 1;
      } else {
        coords1 = this.start1 + 1 + "," + this.length1;
      }
      if (this.length2 === 0) {
        coords2 = this.start2 + ",0";
      } else if (this.length2 == 1) {
        coords2 = this.start2 + 1;
      } else {
        coords2 = this.start2 + 1 + "," + this.length2;
      }
      var text = ["@@ -" + coords1 + " +" + coords2 + " @@\n"];
      var op;
      for (var x = 0; x < this.diffs.length; x++) {
        switch (this.diffs[x][0]) {
          case DIFF_INSERT:
            op = "+";
            break;
          case DIFF_DELETE:
            op = "-";
            break;
          case DIFF_EQUAL:
            op = " ";
            break;
        }
        text[x + 1] = op + encodeURI(this.diffs[x][1]) + "\n";
      }
      return text.join("").replace(/%20/g, " ");
    };
    module2.exports = diff_match_patch2;
    module2.exports["diff_match_patch"] = diff_match_patch2;
    module2.exports["DIFF_DELETE"] = DIFF_DELETE;
    module2.exports["DIFF_INSERT"] = DIFF_INSERT;
    module2.exports["DIFF_EQUAL"] = DIFF_EQUAL;
  }
});

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => MdPrReviewPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian7 = require("obsidian");
var path4 = __toESM(require("path"), 1);
var import_fs4 = require("fs");

// src/settings.ts
var DEFAULT_SETTINGS = {
  remote: "origin",
  baseRefFallback: "origin/main",
  defaultAuthorFilter: "",
  sidecarDir: ".pr-review",
  highlightLineBackground: false,
  diffEnabled: true,
  markdownOnlyQueue: true,
  hideCommentsFrom: "copilot",
  ghPath: "gh",
  gitPath: "git"
};

// src/settingsTab.ts
var import_obsidian = require("obsidian");
var MdPrReviewSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new import_obsidian.Setting(containerEl).setName("Git remote").setDesc("Remote that pull requests are reviewed against.").addText(
      (t) => t.setPlaceholder("origin").setValue(this.plugin.settings.remote).onChange(async (v) => {
        this.plugin.settings.remote = v.trim() || "origin";
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Base ref fallback").setDesc(
      "Used only when a PR's base branch can't be derived from gh (e.g. reviewing a local branch with no PR)."
    ).addText(
      (t) => t.setPlaceholder("origin/main").setValue(this.plugin.settings.baseRefFallback).onChange(async (v) => {
        this.plugin.settings.baseRefFallback = v.trim() || "origin/main";
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Default author filter").setDesc('PR queue author filter. "@me" for your own PRs, a login, or blank for all.').addText(
      (t) => t.setPlaceholder("@me").setValue(this.plugin.settings.defaultAuthorFilter).onChange(async (v) => {
        this.plugin.settings.defaultAuthorFilter = v.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Markdown-only queue").setDesc("Hide pull requests that change no .md files.").addToggle(
      (t) => t.setValue(this.plugin.settings.markdownOnlyQueue).onChange(async (v) => {
        this.plugin.settings.markdownOnlyQueue = v;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Hide comments from").setDesc(
      'Comma-separated login substrings whose PR comments are hidden (case-insensitive). e.g. "copilot".'
    ).addText(
      (t) => t.setPlaceholder("copilot").setValue(this.plugin.settings.hideCommentsFrom).onChange(async (v) => {
        this.plugin.settings.hideCommentsFrom = v;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Sidecar directory").setDesc("Folder (relative to repo root) for gitignored comment sidecars.").addText(
      (t) => t.setPlaceholder(".pr-review").setValue(this.plugin.settings.sidecarDir).onChange(async (v) => {
        this.plugin.settings.sidecarDir = v.trim() || ".pr-review";
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Highlight full line background").setDesc("In addition to the gutter sign, tint the whole changed line.").addToggle(
      (t) => t.setValue(this.plugin.settings.highlightLineBackground).onChange(async (v) => {
        this.plugin.settings.highlightLineBackground = v;
        await this.plugin.saveSettings();
        this.plugin.refreshDiffHighlights();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Executables").setHeading();
    new import_obsidian.Setting(containerEl).setName("gh path").setDesc("Path to the GitHub CLI executable.").addText(
      (t) => t.setPlaceholder("gh").setValue(this.plugin.settings.ghPath).onChange(async (v) => {
        this.plugin.settings.ghPath = v.trim() || "gh";
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("git path").setDesc("Path to the git executable.").addText(
      (t) => t.setPlaceholder("git").setValue(this.plugin.settings.gitPath).onChange(async (v) => {
        this.plugin.settings.gitPath = v.trim() || "git";
        await this.plugin.saveSettings();
      })
    );
  }
};

// src/diffExtension.ts
var import_state2 = require("@codemirror/state");
var import_view2 = require("@codemirror/view");

// node_modules/@codemirror/merge/dist/index.js
var import_view = require("@codemirror/view");
var import_state = require("@codemirror/state");

// node_modules/style-mod/src/style-mod.js
var C = "\u037C";
var COUNT = typeof Symbol == "undefined" ? "__" + C : Symbol.for(C);
var SET = typeof Symbol == "undefined" ? "__styleSet" + Math.floor(Math.random() * 1e8) : Symbol("styleSet");

// node_modules/@codemirror/merge/dist/index.js
var import_language = require("@codemirror/language");
var import_highlight = require("@lezer/highlight");
var Change = class _Change {
  constructor(fromA, toA, fromB, toB) {
    this.fromA = fromA;
    this.toA = toA;
    this.fromB = fromB;
    this.toB = toB;
  }
  /**
  @internal
  */
  offset(offA, offB = offA) {
    return new _Change(this.fromA + offA, this.toA + offA, this.fromB + offB, this.toB + offB);
  }
};
function findDiff(a, fromA, toA, b, fromB, toB) {
  if (a == b)
    return [];
  let prefix = commonPrefix(a, fromA, toA, b, fromB, toB);
  let suffix = commonSuffix(a, fromA + prefix, toA, b, fromB + prefix, toB);
  fromA += prefix;
  toA -= suffix;
  fromB += prefix;
  toB -= suffix;
  let lenA = toA - fromA, lenB = toB - fromB;
  if (!lenA || !lenB)
    return [new Change(fromA, toA, fromB, toB)];
  if (lenA > lenB) {
    let found = a.slice(fromA, toA).indexOf(b.slice(fromB, toB));
    if (found > -1)
      return [
        new Change(fromA, fromA + found, fromB, fromB),
        new Change(fromA + found + lenB, toA, toB, toB)
      ];
  } else if (lenB > lenA) {
    let found = b.slice(fromB, toB).indexOf(a.slice(fromA, toA));
    if (found > -1)
      return [
        new Change(fromA, fromA, fromB, fromB + found),
        new Change(toA, toA, fromB + found + lenA, toB)
      ];
  }
  if (lenA == 1 || lenB == 1)
    return [new Change(fromA, toA, fromB, toB)];
  let half = halfMatch(a, fromA, toA, b, fromB, toB);
  if (half) {
    let [sharedA, sharedB, sharedLen] = half;
    return findDiff(a, fromA, sharedA, b, fromB, sharedB).concat(findDiff(a, sharedA + sharedLen, toA, b, sharedB + sharedLen, toB));
  }
  return findSnake(a, fromA, toA, b, fromB, toB);
}
var scanLimit = 1e9;
var timeout = 0;
var crude = false;
function findSnake(a, fromA, toA, b, fromB, toB) {
  let lenA = toA - fromA, lenB = toB - fromB;
  if (scanLimit < 1e9 && Math.min(lenA, lenB) > scanLimit * 16 || timeout > 0 && Date.now() > timeout) {
    if (Math.min(lenA, lenB) > scanLimit * 64)
      return [new Change(fromA, toA, fromB, toB)];
    return crudeMatch(a, fromA, toA, b, fromB, toB);
  }
  let off = Math.ceil((lenA + lenB) / 2);
  frontier1.reset(off);
  frontier2.reset(off);
  let match1 = (x, y) => a.charCodeAt(fromA + x) == b.charCodeAt(fromB + y);
  let match2 = (x, y) => a.charCodeAt(toA - x - 1) == b.charCodeAt(toB - y - 1);
  let test1 = (lenA - lenB) % 2 != 0 ? frontier2 : null, test2 = test1 ? null : frontier1;
  for (let depth = 0; depth < off; depth++) {
    if (depth > scanLimit || timeout > 0 && !(depth & 63) && Date.now() > timeout)
      return crudeMatch(a, fromA, toA, b, fromB, toB);
    let done = frontier1.advance(depth, lenA, lenB, off, test1, false, match1) || frontier2.advance(depth, lenA, lenB, off, test2, true, match2);
    if (done)
      return bisect(a, fromA, toA, fromA + done[0], b, fromB, toB, fromB + done[1]);
  }
  return [new Change(fromA, toA, fromB, toB)];
}
var Frontier = class {
  constructor() {
    this.vec = [];
  }
  reset(off) {
    this.len = off << 1;
    for (let i = 0; i < this.len; i++)
      this.vec[i] = -1;
    this.vec[off + 1] = 0;
    this.start = this.end = 0;
  }
  advance(depth, lenX, lenY, vOff, other, fromBack, match) {
    for (let k = -depth + this.start; k <= depth - this.end; k += 2) {
      let off = vOff + k;
      let x = k == -depth || k != depth && this.vec[off - 1] < this.vec[off + 1] ? this.vec[off + 1] : this.vec[off - 1] + 1;
      let y = x - k;
      while (x < lenX && y < lenY && match(x, y)) {
        x++;
        y++;
      }
      this.vec[off] = x;
      if (x > lenX) {
        this.end += 2;
      } else if (y > lenY) {
        this.start += 2;
      } else if (other) {
        let offOther = vOff + (lenX - lenY) - k;
        if (offOther >= 0 && offOther < this.len && other.vec[offOther] != -1) {
          if (!fromBack) {
            let xOther = lenX - other.vec[offOther];
            if (x >= xOther)
              return [x, y];
          } else {
            let xOther = other.vec[offOther];
            if (xOther >= lenX - x)
              return [xOther, vOff + xOther - offOther];
          }
        }
      }
    }
    return null;
  }
};
var frontier1 = /* @__PURE__ */ new Frontier();
var frontier2 = /* @__PURE__ */ new Frontier();
function bisect(a, fromA, toA, splitA, b, fromB, toB, splitB) {
  let stop = false;
  if (!validIndex(a, splitA) && ++splitA == toA)
    stop = true;
  if (!validIndex(b, splitB) && ++splitB == toB)
    stop = true;
  if (stop)
    return [new Change(fromA, toA, fromB, toB)];
  return findDiff(a, fromA, splitA, b, fromB, splitB).concat(findDiff(a, splitA, toA, b, splitB, toB));
}
function chunkSize(lenA, lenB) {
  let size = 1, max = Math.min(lenA, lenB);
  while (size < max)
    size = size << 1;
  return size;
}
function commonPrefix(a, fromA, toA, b, fromB, toB) {
  if (fromA == toA || fromA == toB || a.charCodeAt(fromA) != b.charCodeAt(fromB))
    return 0;
  let chunk = chunkSize(toA - fromA, toB - fromB);
  for (let pA = fromA, pB = fromB; ; ) {
    let endA = pA + chunk, endB = pB + chunk;
    if (endA > toA || endB > toB || a.slice(pA, endA) != b.slice(pB, endB)) {
      if (chunk == 1)
        return pA - fromA - (validIndex(a, pA) ? 0 : 1);
      chunk = chunk >> 1;
    } else if (endA == toA || endB == toB) {
      return endA - fromA;
    } else {
      pA = endA;
      pB = endB;
    }
  }
}
function commonSuffix(a, fromA, toA, b, fromB, toB) {
  if (fromA == toA || fromB == toB || a.charCodeAt(toA - 1) != b.charCodeAt(toB - 1))
    return 0;
  let chunk = chunkSize(toA - fromA, toB - fromB);
  for (let pA = toA, pB = toB; ; ) {
    let sA = pA - chunk, sB = pB - chunk;
    if (sA < fromA || sB < fromB || a.slice(sA, pA) != b.slice(sB, pB)) {
      if (chunk == 1)
        return toA - pA - (validIndex(a, pA) ? 0 : 1);
      chunk = chunk >> 1;
    } else if (sA == fromA || sB == fromB) {
      return toA - sA;
    } else {
      pA = sA;
      pB = sB;
    }
  }
}
function findMatch(a, fromA, toA, b, fromB, toB, size, divideTo) {
  let rangeB = b.slice(fromB, toB);
  let best = null;
  for (; ; ) {
    if (best || size < divideTo)
      return best;
    for (let start = fromA + size; ; ) {
      if (!validIndex(a, start))
        start++;
      let end = start + size;
      if (!validIndex(a, end))
        end += end == start + 1 ? 1 : -1;
      if (end >= toA)
        break;
      let seed = a.slice(start, end);
      let found = -1;
      while ((found = rangeB.indexOf(seed, found + 1)) != -1) {
        let prefixAfter = commonPrefix(a, end, toA, b, fromB + found + seed.length, toB);
        let suffixBefore = commonSuffix(a, fromA, start, b, fromB, fromB + found);
        let length = seed.length + prefixAfter + suffixBefore;
        if (!best || best[2] < length)
          best = [start - suffixBefore, fromB + found - suffixBefore, length];
      }
      start = end;
    }
    if (divideTo < 0)
      return best;
    size = size >> 1;
  }
}
function halfMatch(a, fromA, toA, b, fromB, toB) {
  let lenA = toA - fromA, lenB = toB - fromB;
  if (lenA < lenB) {
    let result = halfMatch(b, fromB, toB, a, fromA, toA);
    return result && [result[1], result[0], result[2]];
  }
  if (lenA < 4 || lenB * 2 < lenA)
    return null;
  return findMatch(a, fromA, toA, b, fromB, toB, Math.floor(lenA / 4), -1);
}
function crudeMatch(a, fromA, toA, b, fromB, toB) {
  crude = true;
  let lenA = toA - fromA, lenB = toB - fromB;
  let result;
  if (lenA < lenB) {
    let inv = findMatch(b, fromB, toB, a, fromA, toA, Math.floor(lenA / 6), 50);
    result = inv && [inv[1], inv[0], inv[2]];
  } else {
    result = findMatch(a, fromA, toA, b, fromB, toB, Math.floor(lenB / 6), 50);
  }
  if (!result)
    return [new Change(fromA, toA, fromB, toB)];
  let [sharedA, sharedB, sharedLen] = result;
  return findDiff(a, fromA, sharedA, b, fromB, sharedB).concat(findDiff(a, sharedA + sharedLen, toA, b, sharedB + sharedLen, toB));
}
function mergeAdjacent(changes, minGap) {
  for (let i = 1; i < changes.length; i++) {
    let prev = changes[i - 1], cur = changes[i];
    if (prev.toA > cur.fromA - minGap && prev.toB > cur.fromB - minGap) {
      changes[i - 1] = new Change(prev.fromA, cur.toA, prev.fromB, cur.toB);
      changes.splice(i--, 1);
    }
  }
}
function normalize(a, b, changes) {
  for (; ; ) {
    mergeAdjacent(changes, 1);
    let moved = false;
    for (let i = 0; i < changes.length; i++) {
      let ch = changes[i], pre, post;
      if (pre = commonPrefix(a, ch.fromA, ch.toA, b, ch.fromB, ch.toB))
        ch = changes[i] = new Change(ch.fromA + pre, ch.toA, ch.fromB + pre, ch.toB);
      if (post = commonSuffix(a, ch.fromA, ch.toA, b, ch.fromB, ch.toB))
        ch = changes[i] = new Change(ch.fromA, ch.toA - post, ch.fromB, ch.toB - post);
      let lenA = ch.toA - ch.fromA, lenB = ch.toB - ch.fromB;
      if (lenA && lenB)
        continue;
      let beforeLen = ch.fromA - (i ? changes[i - 1].toA : 0);
      let afterLen = (i < changes.length - 1 ? changes[i + 1].fromA : a.length) - ch.toA;
      if (!beforeLen || !afterLen)
        continue;
      let text = lenA ? a.slice(ch.fromA, ch.toA) : b.slice(ch.fromB, ch.toB);
      if (beforeLen <= text.length && a.slice(ch.fromA - beforeLen, ch.fromA) == text.slice(text.length - beforeLen)) {
        changes[i] = new Change(ch.fromA - beforeLen, ch.toA - beforeLen, ch.fromB - beforeLen, ch.toB - beforeLen);
        moved = true;
      } else if (afterLen <= text.length && a.slice(ch.toA, ch.toA + afterLen) == text.slice(0, afterLen)) {
        changes[i] = new Change(ch.fromA + afterLen, ch.toA + afterLen, ch.fromB + afterLen, ch.toB + afterLen);
        moved = true;
      }
    }
    if (!moved)
      break;
  }
  return changes;
}
function makePresentable(changes, a, b) {
  for (let posA = 0, i = 0; i < changes.length; i++) {
    let change = changes[i];
    let lenA = change.toA - change.fromA, lenB = change.toB - change.fromB;
    if (lenA && lenB || lenA > 3 || lenB > 3) {
      let nextChangeA = i == changes.length - 1 ? a.length : changes[i + 1].fromA;
      let maxScanBefore = change.fromA - posA, maxScanAfter = nextChangeA - change.toA;
      let boundBefore = findWordBoundaryBefore(a, change.fromA, maxScanBefore);
      let boundAfter = findWordBoundaryAfter(a, change.toA, maxScanAfter);
      let lenBefore = change.fromA - boundBefore, lenAfter = boundAfter - change.toA;
      if ((!lenA || !lenB) && lenBefore && lenAfter) {
        let changeLen = Math.max(lenA, lenB);
        let [changeText, changeFrom, changeTo] = lenA ? [a, change.fromA, change.toA] : [b, change.fromB, change.toB];
        if (changeLen > lenBefore && a.slice(boundBefore, change.fromA) == changeText.slice(changeTo - lenBefore, changeTo)) {
          change = changes[i] = new Change(boundBefore, boundBefore + lenA, change.fromB - lenBefore, change.toB - lenBefore);
          boundBefore = change.fromA;
          boundAfter = findWordBoundaryAfter(a, change.toA, nextChangeA - change.toA);
        } else if (changeLen > lenAfter && a.slice(change.toA, boundAfter) == changeText.slice(changeFrom, changeFrom + lenAfter)) {
          change = changes[i] = new Change(boundAfter - lenA, boundAfter, change.fromB + lenAfter, change.toB + lenAfter);
          boundAfter = change.toA;
          boundBefore = findWordBoundaryBefore(a, change.fromA, change.fromA - posA);
        }
        lenBefore = change.fromA - boundBefore;
        lenAfter = boundAfter - change.toA;
      }
      if (lenBefore || lenAfter) {
        change = changes[i] = new Change(change.fromA - lenBefore, change.toA + lenAfter, change.fromB - lenBefore, change.toB + lenAfter);
      } else if (!lenA) {
        let first = findLineBreakAfter(b, change.fromB, change.toB), len;
        let last = first < 0 ? -1 : findLineBreakBefore(b, change.toB, change.fromB);
        if (first > -1 && (len = first - change.fromB) <= maxScanAfter && b.slice(change.fromB, first) == b.slice(change.toB, change.toB + len))
          change = changes[i] = change.offset(len);
        else if (last > -1 && (len = change.toB - last) <= maxScanBefore && b.slice(change.fromB - len, change.fromB) == b.slice(last, change.toB))
          change = changes[i] = change.offset(-len);
      } else if (!lenB) {
        let first = findLineBreakAfter(a, change.fromA, change.toA), len;
        let last = first < 0 ? -1 : findLineBreakBefore(a, change.toA, change.fromA);
        if (first > -1 && (len = first - change.fromA) <= maxScanAfter && a.slice(change.fromA, first) == a.slice(change.toA, change.toA + len))
          change = changes[i] = change.offset(len);
        else if (last > -1 && (len = change.toA - last) <= maxScanBefore && a.slice(change.fromA - len, change.fromA) == a.slice(last, change.toA))
          change = changes[i] = change.offset(-len);
      }
    }
    posA = change.toA;
  }
  mergeAdjacent(changes, 3);
  return changes;
}
var wordChar;
try {
  wordChar = /* @__PURE__ */ new RegExp("[\\p{Alphabetic}\\p{Number}]", "u");
} catch (_) {
}
function asciiWordChar(code) {
  return code > 48 && code < 58 || code > 64 && code < 91 || code > 96 && code < 123;
}
function wordCharAfter(s, pos) {
  if (pos == s.length)
    return 0;
  let next = s.charCodeAt(pos);
  if (next < 192)
    return asciiWordChar(next) ? 1 : 0;
  if (!wordChar)
    return 0;
  if (!isSurrogate1(next) || pos == s.length - 1)
    return wordChar.test(String.fromCharCode(next)) ? 1 : 0;
  return wordChar.test(s.slice(pos, pos + 2)) ? 2 : 0;
}
function wordCharBefore(s, pos) {
  if (!pos)
    return 0;
  let prev = s.charCodeAt(pos - 1);
  if (prev < 192)
    return asciiWordChar(prev) ? 1 : 0;
  if (!wordChar)
    return 0;
  if (!isSurrogate2(prev) || pos == 1)
    return wordChar.test(String.fromCharCode(prev)) ? 1 : 0;
  return wordChar.test(s.slice(pos - 2, pos)) ? 2 : 0;
}
var MAX_SCAN = 8;
function findWordBoundaryAfter(s, pos, max) {
  if (pos == s.length || !wordCharBefore(s, pos))
    return pos;
  for (let cur = pos, end = pos + max, i = 0; i < MAX_SCAN; i++) {
    let size = wordCharAfter(s, cur);
    if (!size || cur + size > end)
      return cur;
    cur += size;
  }
  return pos;
}
function findWordBoundaryBefore(s, pos, max) {
  if (!pos || !wordCharAfter(s, pos))
    return pos;
  for (let cur = pos, end = pos - max, i = 0; i < MAX_SCAN; i++) {
    let size = wordCharBefore(s, cur);
    if (!size || cur - size < end)
      return cur;
    cur -= size;
  }
  return pos;
}
function findLineBreakBefore(s, pos, stop) {
  for (; pos != stop; pos--)
    if (s.charCodeAt(pos - 1) == 10)
      return pos;
  return -1;
}
function findLineBreakAfter(s, pos, stop) {
  for (; pos != stop; pos++)
    if (s.charCodeAt(pos) == 10)
      return pos;
  return -1;
}
var isSurrogate1 = (code) => code >= 55296 && code <= 56319;
var isSurrogate2 = (code) => code >= 56320 && code <= 57343;
function validIndex(s, index) {
  return !index || index == s.length || !isSurrogate1(s.charCodeAt(index - 1)) || !isSurrogate2(s.charCodeAt(index));
}
function diff(a, b, config) {
  var _a;
  let override = config === null || config === void 0 ? void 0 : config.override;
  if (override)
    return override(a, b);
  scanLimit = ((_a = config === null || config === void 0 ? void 0 : config.scanLimit) !== null && _a !== void 0 ? _a : 1e9) >> 1;
  timeout = (config === null || config === void 0 ? void 0 : config.timeout) ? Date.now() + config.timeout : 0;
  crude = false;
  return normalize(a, b, findDiff(a, 0, a.length, b, 0, b.length));
}
function presentableDiff(a, b, config) {
  return makePresentable(diff(a, b, config), a, b);
}

// src/diff.ts
var EMPTY_DIFF = { spans: [], deletions: [] };
function computeDiff(baseText, docText) {
  if (baseText === docText) return EMPTY_DIFF;
  const changes = presentableDiff(baseText, docText, { timeout: 80, scanLimit: 5e5 });
  const spans = [];
  const deletions = [];
  for (const ch of changes) {
    const addedInB = ch.toB > ch.fromB;
    const removedFromA = ch.toA > ch.fromA;
    if (addedInB) {
      spans.push({ fromB: ch.fromB, toB: ch.toB, replacedBase: removedFromA });
    } else if (removedFromA) {
      deletions.push(ch.fromB);
    }
  }
  return { spans, deletions };
}

// src/diffExtension.ts
var lineBackground = false;
function setLineBackground(enabled) {
  lineBackground = enabled;
}
var DEBOUNCE_MS = 150;
var setEnabledEffect = import_state2.StateEffect.define();
var setBaseTextEffect = import_state2.StateEffect.define();
var setResultEffect = import_state2.StateEffect.define();
var addedLine = import_view2.Decoration.line({ class: "mdpr-line mdpr-line-added" });
var modifiedLine = import_view2.Decoration.line({ class: "mdpr-line mdpr-line-modified" });
var SignMarker = class extends import_view2.GutterMarker {
  constructor(kind) {
    super();
    this.kind = kind;
  }
  toDOM() {
    const el = document.createElement("div");
    el.className = `mdpr-sign mdpr-sign-${this.kind}`;
    return el;
  }
};
var addedMark = new SignMarker("added");
var modifiedMark = new SignMarker("modified");
var deletedMark = new SignMarker("deleted");
function lineDeco(t) {
  return t === "added" ? addedLine : modifiedLine;
}
function markerFor(t) {
  return t === "added" ? addedMark : t === "modified" ? modifiedMark : deletedMark;
}
function clamp(n, lo, hi) {
  return n < lo ? lo : n > hi ? hi : n;
}
function buildDecorations(doc, result) {
  const decoRanges = [];
  const markerRanges = [];
  const handled = /* @__PURE__ */ new Set();
  const changedLines = /* @__PURE__ */ new Set();
  for (const span of result.spans) {
    const from = clamp(span.fromB, 0, doc.length);
    const to = clamp(span.toB, 0, doc.length);
    const startLine = doc.lineAt(from).number;
    const endPos = to > from ? to - 1 : from;
    const endLine = doc.lineAt(clamp(endPos, 0, doc.length)).number;
    for (let n = startLine; n <= endLine; n++) {
      const line = doc.line(n);
      changedLines.add(n);
      if (handled.has(line.from)) continue;
      handled.add(line.from);
      const wholeLine = from <= line.from && to >= line.to;
      const type = !span.replacedBase && wholeLine ? "added" : "modified";
      if (lineBackground) decoRanges.push(lineDeco(type).range(line.from));
      markerRanges.push(markerFor(type).range(line.from));
    }
  }
  for (const offset of result.deletions) {
    const line = doc.lineAt(clamp(offset, 0, doc.length));
    changedLines.add(line.number);
    if (handled.has(line.from)) continue;
    handled.add(line.from);
    markerRanges.push(markerFor("deleted").range(line.from));
  }
  return {
    deco: import_view2.Decoration.set(decoRanges, true),
    markers: import_state2.RangeSet.of(markerRanges, true),
    changedLines
  };
}
var EMPTY_LINES = /* @__PURE__ */ new Set();
var diffField = import_state2.StateField.define({
  create() {
    return {
      enabled: false,
      baseText: null,
      deco: import_view2.Decoration.none,
      gutterMarkers: import_state2.RangeSet.empty,
      changedLines: EMPTY_LINES
    };
  },
  update(value, tr) {
    let { enabled, baseText, deco, gutterMarkers, changedLines } = value;
    if (tr.docChanged) {
      deco = deco.map(tr.changes);
      gutterMarkers = gutterMarkers.map(tr.changes);
    }
    for (const e of tr.effects) {
      if (e.is(setEnabledEffect)) {
        enabled = e.value;
        if (!enabled) {
          baseText = null;
          deco = import_view2.Decoration.none;
          gutterMarkers = import_state2.RangeSet.empty;
          changedLines = EMPTY_LINES;
        }
      } else if (e.is(setBaseTextEffect)) {
        baseText = e.value;
      } else if (e.is(setResultEffect)) {
        const built = buildDecorations(tr.state.doc, e.value);
        deco = built.deco;
        gutterMarkers = built.markers;
        changedLines = built.changedLines;
      }
    }
    return { enabled, baseText, deco, gutterMarkers, changedLines };
  },
  provide: (f) => import_view2.EditorView.decorations.from(f, (s) => s.deco)
});
var diffGutter = (0, import_view2.gutter)({
  class: "mdpr-gutter",
  markers: (view) => view.state.field(diffField, false)?.gutterMarkers ?? import_state2.RangeSet.empty
});
var recomputePlugin = import_view2.ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.view = view;
      this.timer = -1;
    }
    update(u) {
      const st = u.state.field(diffField, false);
      if (!st || !st.enabled || st.baseText == null) {
        this.cancel();
        return;
      }
      const activated = u.transactions.some(
        (tr) => tr.effects.some((e) => e.is(setEnabledEffect) || e.is(setBaseTextEffect))
      );
      if (u.docChanged || activated) this.schedule();
    }
    schedule() {
      this.cancel();
      this.timer = window.setTimeout(() => {
        this.timer = -1;
        this.recompute();
      }, DEBOUNCE_MS);
    }
    recompute() {
      const st = this.view.state.field(diffField, false);
      if (!st || !st.enabled || st.baseText == null) return;
      const result = computeDiff(st.baseText, this.view.state.doc.toString());
      this.view.dispatch({ effects: setResultEffect.of(result) });
    }
    cancel() {
      if (this.timer >= 0) {
        window.clearTimeout(this.timer);
        this.timer = -1;
      }
    }
    destroy() {
      this.cancel();
    }
  }
);
var BLOCK_CLASS = "mdpr-changed-block";
var changedBlockPlugin = import_view2.ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.view = view;
      this.raf = -1;
      this.schedule();
    }
    update(u) {
      const touched = u.transactions.some(
        (tr) => tr.effects.some((e) => e.is(setResultEffect) || e.is(setEnabledEffect))
      );
      if (u.docChanged || u.viewportChanged || u.geometryChanged || touched) {
        this.schedule();
      }
    }
    schedule() {
      if (this.raf >= 0) cancelAnimationFrame(this.raf);
      this.raf = requestAnimationFrame(() => {
        this.raf = -1;
        this.apply();
      });
    }
    apply() {
      const content = this.view.contentDOM;
      content.querySelectorAll(`.${BLOCK_CLASS}`).forEach((el) => el.classList.remove(BLOCK_CLASS));
      const st = this.view.state.field(diffField, false);
      if (!st || !st.enabled || st.changedLines.size === 0) return;
      const doc = this.view.state.doc;
      const marked = /* @__PURE__ */ new Set();
      for (const lineNo of st.changedLines) {
        if (lineNo < 1 || lineNo > doc.lines) continue;
        const el = this.markableBlockAt(doc.line(lineNo).from);
        if (el && !marked.has(el)) {
          el.classList.add(BLOCK_CLASS);
          marked.add(el);
        }
      }
    }
    // Only rendered widget blocks — not plain source lines (they get gutter
    // signs), the off-screen gap, or the measurement spacer.
    isMarkable(el) {
      const cl = el.classList;
      return el.className !== "" && !cl.contains("cm-line") && !cl.contains("cm-gap");
    }
    markableBlockAt(pos) {
      const content = this.view.contentDOM;
      let node;
      let offset;
      try {
        ({ node, offset } = this.view.domAtPos(pos));
      } catch {
        return null;
      }
      if (node === content) {
        const candidates = [content.childNodes[offset], content.childNodes[offset - 1]];
        for (const c of candidates) {
          if (c instanceof HTMLElement && this.isMarkable(c)) return c;
        }
        return null;
      }
      let el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
      while (el && el.parentElement && el.parentElement !== content) {
        el = el.parentElement;
      }
      return el && el.parentElement === content && this.isMarkable(el) ? el : null;
    }
    destroy() {
      if (this.raf >= 0) cancelAnimationFrame(this.raf);
      this.view.contentDOM.querySelectorAll(`.${BLOCK_CLASS}`).forEach((el) => el.classList.remove(BLOCK_CLASS));
    }
  }
);
var diffExtension = [
  diffField,
  diffGutter,
  recomputePlugin,
  changedBlockPlugin
];
function enableDiff(view, baseText) {
  view.dispatch({
    effects: [setEnabledEffect.of(true), setBaseTextEffect.of(baseText)]
  });
}
function disableDiff(view) {
  view.dispatch({ effects: setEnabledEffect.of(false) });
}
function retriggerDiff(view) {
  const st = view.state.field(diffField, false);
  if (st?.enabled && st.baseText != null) {
    view.dispatch({ effects: setBaseTextEffect.of(st.baseText) });
  }
}

// src/git.ts
var path = __toESM(require("path"), 1);
var import_fs = require("fs");

// src/shell.ts
var import_child_process = require("child_process");
var EXTRA_PATHS = [
  "/opt/homebrew/bin",
  "/usr/local/bin",
  "/usr/bin",
  "/bin",
  "/usr/sbin",
  "/sbin"
];
function buildEnv() {
  const env = { ...process.env };
  const existing = env.PATH ? env.PATH.split(":") : [];
  env.PATH = Array.from(/* @__PURE__ */ new Set([...existing, ...EXTRA_PATHS])).join(":");
  return env;
}
function isTransient(stderr) {
  return /\b(50[234])\b|timeout|timed out|temporarily unavailable|try again|too quickly|EAI_AGAIN|ECONNRESET|ETIMEDOUT|bad gateway|service unavailable/i.test(
    stderr
  );
}
var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function once(file, args, opts) {
  return new Promise((resolve) => {
    (0, import_child_process.execFile)(
      file,
      args,
      {
        cwd: opts.cwd,
        timeout: opts.timeoutMs ?? 2e4,
        maxBuffer: 64 * 1024 * 1024,
        env: buildEnv(),
        windowsHide: true
      },
      (err, stdout, stderr) => {
        const e = err;
        if (e && e.code === "ENOENT") {
          resolve({
            stdout: "",
            stderr: `Executable not found: ${file}. Set its full path in Markdown PR Review settings.`,
            code: 127
          });
          return;
        }
        const code = e ? typeof e.code === "number" ? e.code : 1 : 0;
        resolve({
          stdout: stdout?.toString() ?? "",
          stderr: stderr?.toString() ?? "",
          code
        });
      }
    );
  });
}
async function run(file, args, opts = {}) {
  const retries = opts.retries ?? 0;
  let res = await once(file, args, opts);
  for (let attempt = 0; attempt < retries && res.code !== 0 && isTransient(res.stderr); attempt++) {
    await sleep(500 * (attempt + 1));
    res = await once(file, args, opts);
  }
  return res;
}

// src/git.ts
var GitError = class extends Error {
};
async function locate(gitPath, absFilePath) {
  const dir = path.dirname(absFilePath);
  const res = await run(gitPath, ["rev-parse", "--show-toplevel"], { cwd: dir });
  if (res.code !== 0) {
    throw new GitError(
      res.stderr.trim() || `${absFilePath} is not inside a git repository.`
    );
  }
  const repoRoot = await realpath(res.stdout.trim());
  const realAbs = await realpath(absFilePath);
  const relPath = path.relative(repoRoot, realAbs).split(path.sep).join("/");
  return { repoRoot, relPath, dir };
}
async function realpath(p) {
  try {
    return await import_fs.promises.realpath(p);
  } catch {
    return p;
  }
}
async function repoRootOf(gitPath, cwd) {
  const res = await run(gitPath, ["rev-parse", "--show-toplevel"], { cwd });
  return res.code === 0 ? res.stdout.trim() : null;
}
async function isTreeDirty(gitPath, repoRoot) {
  const res = await run(gitPath, ["status", "--porcelain", "--untracked-files=no"], {
    cwd: repoRoot
  });
  return res.code === 0 && res.stdout.trim().length > 0;
}
async function dirtyFiles(gitPath, repoRoot) {
  const res = await run(gitPath, ["status", "--porcelain", "--untracked-files=no"], {
    cwd: repoRoot
  });
  if (res.code !== 0) return [];
  return res.stdout.split(/\r?\n/).map((l) => l.slice(3).trim()).filter(Boolean);
}
async function stashTracked(gitPath, repoRoot, message) {
  const res = await run(gitPath, ["stash", "push", "-m", message], {
    cwd: repoRoot,
    timeoutMs: 3e4
  });
  return res.code === 0;
}
async function ensureExcluded(gitPath, repoRoot, sidecarDir) {
  const dir = sidecarDir.replace(/[/\\]+$/, "");
  const entry = `${dir}/`;
  let excludePath;
  const res = await run(gitPath, ["rev-parse", "--git-path", "info/exclude"], {
    cwd: repoRoot
  });
  if (res.code === 0 && res.stdout.trim()) {
    const p = res.stdout.trim();
    excludePath = path.isAbsolute(p) ? p : path.join(repoRoot, p);
  } else {
    excludePath = path.join(repoRoot, ".git", "info", "exclude");
  }
  let content = "";
  try {
    content = await import_fs.promises.readFile(excludePath, "utf8");
  } catch {
  }
  const present = content.split(/\r?\n/).map((l) => l.trim()).some((l) => l === entry || l === dir);
  if (present) return;
  await import_fs.promises.mkdir(path.dirname(excludePath), { recursive: true });
  const prefix = content && !content.endsWith("\n") ? "\n" : "";
  await import_fs.promises.writeFile(excludePath, `${content}${prefix}${entry}
`, "utf8");
}
async function fileAtRef(gitPath, repoRoot, ref, relPath) {
  const res = await run(gitPath, ["show", `${ref}:${relPath}`], { cwd: repoRoot });
  return res.code === 0 ? res.stdout : null;
}
async function mergeBase(gitPath, repoRoot, a, b) {
  const res = await run(gitPath, ["merge-base", a, b], { cwd: repoRoot });
  return res.code === 0 ? res.stdout.trim() : null;
}
async function resolveBase(gitPath, loc, baseRef) {
  const mb = await mergeBase(gitPath, loc.repoRoot, baseRef, "HEAD");
  const baseSha = mb ?? baseRef;
  const show = await run(gitPath, ["show", `${baseSha}:${loc.relPath}`], {
    cwd: loc.repoRoot
  });
  if (show.code === 0) {
    return { baseText: show.stdout, baseSha, isNew: false };
  }
  const stderr = show.stderr.toLowerCase();
  if (stderr.includes("does not exist") || stderr.includes("exists on disk, but not in") || stderr.includes("path") || stderr.includes("fatal: invalid object")) {
    return { baseText: "", baseSha, isNew: true };
  }
  throw new GitError(show.stderr.trim() || "Failed to read base version of file.");
}

// src/github.ts
var GhError = class extends Error {
};
var LIST_FIELDS = "number,title,author,headRefName,baseRefName,updatedAt,files";
var MARKDOWN_RE = /\.(md|markdown|mdx)$/i;
function markdownFiles(pr) {
  return (pr.files ?? []).filter((f) => MARKDOWN_RE.test(f.path));
}
async function listPullRequests(ghPath, repoRoot, opts) {
  const args = [
    "pr",
    "list",
    "--state",
    "open",
    "--json",
    LIST_FIELDS,
    "--limit",
    String(opts.limit ?? 100)
  ];
  const search = opts.search?.trim();
  if (search) args.push("--search", search);
  const res = await run(ghPath, args, { cwd: repoRoot, timeoutMs: 3e4, retries: 2 });
  if (res.code !== 0) {
    throw new GhError(res.stderr.trim() || "gh pr list failed");
  }
  try {
    const parsed = JSON.parse(res.stdout);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    throw new GhError("Could not parse gh output: " + String(e));
  }
}
async function currentUser(ghPath, repoRoot) {
  const res = await run(ghPath, ["api", "user", "--jq", ".login"], {
    cwd: repoRoot,
    timeoutMs: 15e3,
    retries: 2
  });
  return res.code === 0 ? res.stdout.trim() || null : null;
}
async function checkoutPullRequest(ghPath, repoRoot, prNumber) {
  const res = await run(ghPath, ["pr", "checkout", String(prNumber)], {
    cwd: repoRoot,
    timeoutMs: 6e4,
    retries: 2
  });
  if (res.code !== 0) {
    throw new GhError(res.stderr.trim() || `gh pr checkout ${prNumber} failed`);
  }
}
async function prHeadSha(ghPath, repoRoot, prNumber) {
  const res = await run(
    ghPath,
    ["pr", "view", String(prNumber), "--json", "headRefOid", "--jq", ".headRefOid"],
    { cwd: repoRoot, timeoutMs: 2e4, retries: 2 }
  );
  return res.code === 0 ? res.stdout.trim() || null : null;
}
async function repoTarget(ghPath, repoRoot) {
  const res = await run(ghPath, ["repo", "view", "--json", "nameWithOwner,url"], {
    cwd: repoRoot,
    timeoutMs: 2e4,
    retries: 2
  });
  if (res.code !== 0) return null;
  try {
    const j = JSON.parse(res.stdout);
    return { host: new URL(j.url).host, nameWithOwner: j.nameWithOwner, url: j.url };
  } catch {
    return null;
  }
}
async function listReviewComments(ghPath, host, nameWithOwner, prNumber) {
  const res = await run(
    ghPath,
    [
      "api",
      "--hostname",
      host,
      `repos/${nameWithOwner}/pulls/${prNumber}/comments?per_page=100`
    ],
    { timeoutMs: 3e4, retries: 2 }
  );
  if (res.code !== 0) {
    throw new GhError(res.stderr.trim() || "gh api pulls/comments failed");
  }
  try {
    const arr = JSON.parse(res.stdout);
    if (!Array.isArray(arr)) return [];
    return arr.map((c) => ({
      id: Number(c.id),
      login: c.user?.login ?? "?",
      path: c.path ?? "",
      line: c.line ?? c.original_line ?? null,
      body: c.body ?? "",
      createdAt: c.created_at ?? "",
      inReplyToId: c.in_reply_to_id ?? null,
      reviewId: c.pull_request_review_id ?? null
    }));
  } catch (e) {
    throw new GhError("Could not parse review comments: " + String(e));
  }
}
async function listReviews(ghPath, host, nameWithOwner, prNumber) {
  const res = await run(
    ghPath,
    [
      "api",
      "--hostname",
      host,
      `repos/${nameWithOwner}/pulls/${prNumber}/reviews?per_page=100`
    ],
    { timeoutMs: 3e4, retries: 2 }
  );
  if (res.code !== 0) {
    throw new GhError(res.stderr.trim() || "gh api pulls/reviews (list) failed");
  }
  try {
    const arr = JSON.parse(res.stdout);
    if (!Array.isArray(arr)) return [];
    return arr.map((r) => ({
      id: Number(r.id),
      login: r.user?.login ?? "?",
      state: r.state ?? "",
      body: r.body ?? "",
      submittedAt: r.submitted_at ?? ""
    }));
  } catch (e) {
    throw new GhError("Could not parse reviews: " + String(e));
  }
}

// src/review.ts
var import_fs2 = require("fs");
var os = __toESM(require("os"), 1);
var path2 = __toESM(require("path"), 1);

// src/anchor.ts
var import_diff_match_patch = __toESM(require_diff_match_patch(), 1);
var CTX = 32;
function captureAnchor(doc, from, to) {
  return {
    quote: doc.slice(from, to),
    prefix: doc.slice(Math.max(0, from - CTX), from),
    suffix: doc.slice(to, Math.min(doc.length, to + CTX)),
    posHint: from
  };
}
function resolveAnchor(doc, a) {
  if (!a.quote) return null;
  const occurrences = indexesOf(doc, a.quote);
  if (occurrences.length === 1) {
    return { from: occurrences[0], to: occurrences[0] + a.quote.length };
  }
  if (occurrences.length > 1) {
    let best = occurrences[0];
    let bestScore = -Infinity;
    for (const i of occurrences) {
      const score = contextScore(doc, i, a) - Math.abs(i - a.posHint) / 1e6;
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    return { from: best, to: best + a.quote.length };
  }
  const dmp = new import_diff_match_patch.diff_match_patch();
  dmp.Match_Threshold = 0.5;
  dmp.Match_Distance = 1e3;
  const pattern = a.quote.length > 32 ? a.quote.slice(0, 32) : a.quote;
  const loc = clamp2(a.posHint, 0, doc.length);
  const idx = dmp.match_main(doc, pattern, loc);
  if (idx < 0) return null;
  return { from: idx, to: Math.min(doc.length, idx + a.quote.length) };
}
function indexesOf(hay, needle) {
  const out = [];
  let i = hay.indexOf(needle);
  while (i !== -1) {
    out.push(i);
    i = hay.indexOf(needle, i + 1);
  }
  return out;
}
function contextScore(doc, at, a) {
  const before = doc.slice(Math.max(0, at - a.prefix.length), at);
  const after = doc.slice(at + a.quote.length, at + a.quote.length + a.suffix.length);
  return commonSuffixLen(before, a.prefix) + commonPrefixLen(after, a.suffix);
}
function commonSuffixLen(x, y) {
  let n = 0;
  while (n < x.length && n < y.length && x[x.length - 1 - n] === y[y.length - 1 - n]) n++;
  return n;
}
function commonPrefixLen(x, y) {
  let n = 0;
  while (n < x.length && n < y.length && x[n] === y[n]) n++;
  return n;
}
function clamp2(n, lo, hi) {
  return n < lo ? lo : n > hi ? hi : n;
}

// src/review.ts
var ReviewError = class extends Error {
};
function isInlineRejection(err) {
  const m = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return m.includes("422") || m.includes("unprocessable") || m.includes("part of the diff") || m.includes("line must");
}
async function resolveDocComments(gitPath, repoRoot, relPath, baseRef, headRef, comments) {
  let current = await fileAtRef(gitPath, repoRoot, headRef, relPath);
  if (current == null) {
    try {
      current = await import_fs2.promises.readFile(path2.join(repoRoot, relPath), "utf8");
    } catch {
      return comments.map((c) => ({
        comment: c,
        line: null,
        inline: false,
        quote: c.anchor.quote
      }));
    }
  }
  let baseText = "";
  try {
    baseText = (await resolveBase(gitPath, { repoRoot, relPath, dir: repoRoot }, baseRef)).baseText;
  } catch {
    baseText = "";
  }
  const starts = lineStarts(current);
  const changed = changedLineSet(baseText, current, starts);
  return comments.map((c) => {
    const r = resolveAnchor(current, c.anchor);
    if (!r) return { comment: c, line: null, inline: false, quote: c.anchor.quote };
    const line = lineOf(starts, r.from);
    return { comment: c, line, inline: changed.has(line), quote: c.anchor.quote };
  });
}
function buildReviewPayload(files, headSha, repoUrl, opts = {}) {
  const inline = [];
  const fallback = [];
  for (const f of files) {
    for (const rc of f.resolved) {
      if (rc.comment.status !== "open" || rc.comment.postedAt) continue;
      if (!opts.allToBody && rc.inline && rc.line) {
        inline.push({ path: f.relPath, line: rc.line, side: "RIGHT", body: rc.comment.body });
      } else {
        fallback.push({
          file: f.relPath,
          line: rc.line,
          body: rc.comment.body,
          quote: rc.quote
        });
      }
    }
  }
  const parts = [];
  if (opts.summary) parts.push(opts.summary);
  if (fallback.length) {
    let section = "**Comments on unchanged lines:**";
    for (const fb of fallback) {
      const loc = fb.line ? `${fb.file}:${fb.line}` : `${fb.file} (unanchored)`;
      const link = repoUrl && fb.line ? ` ([view](${repoUrl}/blob/${headSha}/${fb.file}#L${fb.line}))` : "";
      section += `

- \`${loc}\`${link} \u2014 ${fb.body}`;
      if (fb.quote) section += `
  > ${truncate(fb.quote, 140)}`;
    }
    parts.push(section);
  }
  let body = parts.join("\n\n");
  if (!body) body = "Reviewed in Obsidian \xB7 Markdown PR Review";
  return {
    payload: {
      commit_id: headSha,
      body,
      event: opts.event ?? "COMMENT",
      comments: inline
    },
    inlineCount: inline.length,
    fallbackCount: fallback.length
  };
}
async function postReview(ghPath, repoRoot, host, nameWithOwner, prNumber, payload) {
  const tmp = path2.join(
    os.tmpdir(),
    `mdpr-review-${Date.now()}-${Math.random().toString(36).slice(2)}.json`
  );
  await import_fs2.promises.writeFile(tmp, JSON.stringify(payload), "utf8");
  try {
    const res = await run(
      ghPath,
      [
        "api",
        "--hostname",
        host,
        "--method",
        "POST",
        `repos/${nameWithOwner}/pulls/${prNumber}/reviews`,
        "--input",
        tmp
      ],
      { cwd: repoRoot, timeoutMs: 6e4 }
    );
    if (res.code !== 0) {
      throw new ReviewError(res.stderr.trim() || "gh api pulls/reviews failed");
    }
    try {
      return JSON.parse(res.stdout);
    } catch {
      return {};
    }
  } finally {
    await import_fs2.promises.unlink(tmp).catch(() => void 0);
  }
}
function lineStarts(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") starts.push(i + 1);
  return starts;
}
function lineOf(starts, offset) {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = lo + hi + 1 >> 1;
    if (starts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}
function changedLineSet(baseText, current, starts) {
  const set = /* @__PURE__ */ new Set();
  if (baseText === "") {
    for (let n = 1; n <= starts.length; n++) set.add(n);
    return set;
  }
  const clamp3 = (n) => n < 0 ? 0 : n > current.length ? current.length : n;
  const res = computeDiff(baseText, current);
  for (const s of res.spans) {
    const a = lineOf(starts, clamp3(s.fromB));
    const b = lineOf(starts, clamp3(s.toB > s.fromB ? s.toB - 1 : s.fromB));
    for (let n = a; n <= b; n++) set.add(n);
  }
  for (const d of res.deletions) set.add(lineOf(starts, clamp3(d)));
  return set;
}
function truncate(s, n) {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > n ? flat.slice(0, n) + "\u2026" : flat;
}

// src/reviewSubmitModal.ts
var import_obsidian2 = require("obsidian");
var ReviewSubmitModal = class extends import_obsidian2.Modal {
  constructor(app, opts) {
    super(app);
    this.summary = "";
    this.done = false;
    this.opts = opts;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: `Post review to PR #${this.opts.prNumber}` });
    contentEl.createEl("p", {
      cls: "mdpr-modal-sub",
      text: `${this.opts.inlineCount} inline \xB7 ${this.opts.fallbackCount} summary comment(s)`
    });
    new import_obsidian2.Setting(contentEl).setName("Summary (optional)").addTextArea((t) => {
      t.setPlaceholder("Overall review comment\u2026");
      t.onChange((v) => this.summary = v);
      t.inputEl.rows = 4;
      t.inputEl.addClass("mdpr-modal-textarea");
      window.setTimeout(() => t.inputEl.focus(), 0);
    });
    const buttons = contentEl.createDiv({ cls: "mdpr-modal-buttons" });
    const cancel = buttons.createEl("button", { text: "Cancel" });
    cancel.onclick = () => this.finish(null);
    const requestBtn = buttons.createEl("button", {
      text: "Request changes",
      cls: "mod-warning"
    });
    requestBtn.onclick = () => this.finish("REQUEST_CHANGES");
    const approveBtn = buttons.createEl("button", { text: "Approve" });
    approveBtn.onclick = () => this.finish("APPROVE");
    const commentBtn = buttons.createEl("button", { text: "Comment", cls: "mod-cta" });
    commentBtn.onclick = () => this.finish("COMMENT");
  }
  finish(event) {
    if (this.done) return;
    this.done = true;
    this.opts.onSubmit(event ? { event, summary: this.summary.trim() } : null);
    this.close();
  }
  onClose() {
    if (!this.done) {
      this.done = true;
      this.opts.onSubmit(null);
    }
    this.contentEl.empty();
  }
};

// src/confirmModal.ts
var import_obsidian3 = require("obsidian");
var ConfirmModal = class extends import_obsidian3.Modal {
  constructor(app, opts) {
    super(app);
    this.done = false;
    this.opts = opts;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: this.opts.title });
    this.opts.build(contentEl.createDiv({ cls: "mdpr-confirm-body" }));
    const buttons = contentEl.createDiv({ cls: "mdpr-modal-buttons" });
    const cancel = buttons.createEl("button", { text: "Cancel" });
    cancel.onclick = () => this.finish(false);
    const confirm = buttons.createEl("button", {
      text: this.opts.confirmText,
      cls: this.opts.confirmCls ?? "mod-cta"
    });
    confirm.onclick = () => this.finish(true);
  }
  finish(ok) {
    if (this.done) return;
    this.done = true;
    this.opts.onResult(ok);
    this.close();
  }
  onClose() {
    if (!this.done) {
      this.done = true;
      this.opts.onResult(false);
    }
    this.contentEl.empty();
  }
};

// src/fileTree.ts
function isHiddenPath(relPath) {
  return relPath.split("/").some((seg) => seg.startsWith("."));
}
function buildFileTree(paths) {
  const root = { name: "", children: [] };
  for (const p of paths) {
    const parts = p.split("/");
    let node = root;
    parts.forEach((part, i) => {
      const isFile = i === parts.length - 1;
      let child = node.children.find(
        (c) => c.name === part && c.path !== void 0 === isFile
      );
      if (!child) {
        child = { name: part, children: [] };
        if (isFile) child.path = p;
        node.children.push(child);
      }
      node = child;
    });
  }
  const collapsed = root.children.map(collapseChain);
  sortNodes(collapsed);
  return collapsed;
}
function isFolder(n) {
  return n.path === void 0;
}
function collapseChain(node) {
  if (isFolder(node)) {
    while (node.children.length === 1 && isFolder(node.children[0])) {
      const only = node.children[0];
      node = { name: `${node.name}/${only.name}`, children: only.children };
    }
    node.children = node.children.map(collapseChain);
  }
  return node;
}
function sortNodes(nodes) {
  nodes.sort((a, b) => {
    const af = isFolder(a);
    const bf = isFolder(b);
    if (af !== bf) return af ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (const n of nodes) if (n.children.length) sortNodes(n.children);
}

// src/prQueueView.ts
var import_obsidian4 = require("obsidian");
var PR_QUEUE_VIEW_TYPE = "mdpr-pr-queue";
var PrQueueView = class extends import_obsidian4.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.repos = [];
    this.prs = [];
    this.searchFilter = "";
    this.loading = false;
    this.errorMsg = "";
    this.myLogin = null;
    this.myLoginResolved = false;
    this.bodyEl = null;
    this.treeCollapsed = /* @__PURE__ */ new Set();
    this.plugin = plugin;
    this.authorFilter = plugin.settings.defaultAuthorFilter;
  }
  getViewType() {
    return PR_QUEUE_VIEW_TYPE;
  }
  getDisplayText() {
    return "PR review queue";
  }
  getIcon() {
    return "git-pull-request";
  }
  async onOpen() {
    this.render();
    await this.refresh();
  }
  async onClose() {
  }
  async refresh() {
    this.loading = true;
    this.errorMsg = "";
    this.render();
    try {
      this.repos = await this.plugin.discoverRepos();
      if (this.repos.length === 0) {
        this.errorMsg = "No git repositories found in this vault.";
        this.prs = [];
        return;
      }
      let repo = this.plugin.selectedRepo;
      if (!repo || !this.repos.some((r) => r.repoRoot === repo.repoRoot)) {
        repo = this.repos[0];
        await this.plugin.setSelectedRepo(repo);
      }
      if (!this.myLoginResolved) {
        this.myLogin = await currentUser(this.plugin.settings.ghPath, repo.repoRoot);
        this.myLoginResolved = true;
      }
      this.prs = await listPullRequests(this.plugin.settings.ghPath, repo.repoRoot, {
        search: this.searchFilter
      });
    } catch (e) {
      this.errorMsg = e.message;
      this.prs = [];
    } finally {
      this.loading = false;
      this.render();
    }
  }
  matchesAuthor(pr, needle) {
    const login = (pr.author?.login ?? "").toLowerCase();
    const name = (pr.author?.name ?? "").toLowerCase();
    if (needle === "@me") return this.myLogin ? login === this.myLogin.toLowerCase() : false;
    return login.includes(needle) || name.includes(needle);
  }
  visiblePrs() {
    let list = this.prs;
    if (this.plugin.settings.markdownOnlyQueue) {
      list = list.filter((pr) => markdownFiles(pr).length > 0);
    }
    const needle = this.authorFilter.trim().toLowerCase();
    if (needle) list = list.filter((pr) => this.matchesAuthor(pr, needle));
    return list;
  }
  render() {
    const c = this.contentEl;
    c.empty();
    c.addClass("mdpr-queue");
    this.renderFilters(c);
    this.renderSessionBar(c);
    this.renderFileTree(c);
    this.bodyEl = c.createDiv({ cls: "mdpr-queue-body" });
    this.renderBody();
  }
  /** Re-render only the list/status area, so filter inputs keep focus. */
  renderBody() {
    const c = this.bodyEl;
    if (!c) return;
    c.empty();
    if (this.loading) {
      c.createDiv({ cls: "mdpr-queue-status", text: "Loading pull requests\u2026" });
      return;
    }
    if (this.errorMsg) {
      c.createDiv({ cls: "mdpr-queue-status mdpr-error", text: this.errorMsg });
      c.createDiv({
        cls: "mdpr-queue-status",
        text: "The queue needs a repo with a GitHub remote that `gh` is authed for. A local-only repo (no remote) has no PRs to list."
      });
      return;
    }
    const visible = this.visiblePrs();
    if (visible.length === 0) {
      c.createDiv({ cls: "mdpr-queue-status", text: "No open pull requests match." });
      return;
    }
    this.renderList(c, visible);
  }
  renderFilters(c) {
    const header = c.createDiv({ cls: "mdpr-queue-header" });
    const top = header.createDiv({ cls: "mdpr-queue-title-row" });
    top.createSpan({ text: "PR review queue", cls: "mdpr-queue-title" });
    const refreshBtn = top.createEl("button", {
      cls: "mdpr-icon-btn",
      attr: { "aria-label": "Refresh" }
    });
    (0, import_obsidian4.setIcon)(refreshBtn, "refresh-cw");
    refreshBtn.onclick = () => void this.refresh();
    const repoRow = header.createDiv({ cls: "mdpr-repo-row" });
    repoRow.createSpan({ cls: "mdpr-repo-label", text: "Repo" });
    const select = repoRow.createEl("select", { cls: "mdpr-select" });
    if (this.repos.length === 0) {
      select.createEl("option", { text: "(none found)", value: "" });
      select.disabled = true;
    } else {
      for (const r of this.repos) {
        const opt = select.createEl("option", { text: r.name, value: r.repoRoot });
        if (this.plugin.selectedRepo?.repoRoot === r.repoRoot) opt.selected = true;
      }
      select.onchange = async () => {
        const chosen = this.repos.find((r) => r.repoRoot === select.value);
        if (chosen) {
          await this.plugin.setSelectedRepo(chosen);
          await this.refresh();
        }
      };
    }
    const authorInput = header.createEl("input", {
      cls: "mdpr-input",
      attr: { type: "text", placeholder: "Filter by author (partial, or @me)" }
    });
    authorInput.value = this.authorFilter;
    authorInput.oninput = () => {
      this.authorFilter = authorInput.value;
      this.renderBody();
    };
    const searchInput = header.createEl("input", {
      cls: "mdpr-input",
      attr: { type: "text", placeholder: 'gh search (e.g. "label:design") \u2014 Enter' }
    });
    searchInput.value = this.searchFilter;
    searchInput.oninput = () => this.searchFilter = searchInput.value;
    searchInput.onkeydown = (e) => {
      if (e.key === "Enter") void this.refresh();
    };
    const toggleRow = header.createDiv({ cls: "mdpr-toggle-row" });
    const cb = toggleRow.createEl("input", { attr: { type: "checkbox" } });
    cb.checked = this.plugin.settings.markdownOnlyQueue;
    cb.onchange = async () => {
      this.plugin.settings.markdownOnlyQueue = cb.checked;
      await this.plugin.saveSettings();
      this.renderBody();
    };
    toggleRow.createSpan({ text: "Markdown changes only" });
  }
  renderSessionBar(c) {
    const session = this.plugin.session;
    if (!session) return;
    const bar = c.createDiv({ cls: "mdpr-session" });
    const n = session.mdFiles.length;
    bar.createDiv({ cls: "mdpr-session-row" }).createSpan({
      cls: "mdpr-session-label",
      text: `PR #${session.prNumber} \xB7 ${n} file${n === 1 ? "" : "s"}`
    });
  }
  renderFileTree(c) {
    const s = this.plugin.session;
    if (!s || s.mdFiles.length === 0) return;
    const wrap = c.createDiv({ cls: "mdpr-filetree" });
    const nodes = buildFileTree(s.mdFiles);
    this.renderTreeNodes(wrap, nodes, 0, "", s.mdFiles[s.fileIndex]);
  }
  renderTreeNodes(parent, nodes, depth, prefix, current) {
    for (const node of nodes) {
      const indent = depth * 12 + 8;
      if (node.path !== void 0) {
        const row = parent.createDiv({ cls: "mdpr-tree-row mdpr-tree-file" });
        row.style.paddingLeft = `${indent}px`;
        const p = node.path;
        const hidden = isHiddenPath(p);
        if (hidden) {
          row.addClass("mdpr-tree-hidden");
        } else {
          if (p === current) row.addClass("mdpr-tree-current");
          if (this.plugin.isFileSeen(p)) row.addClass("mdpr-tree-seen");
        }
        const icon = row.createSpan({ cls: "mdpr-tree-icon" });
        (0, import_obsidian4.setIcon)(icon, hidden ? "eye-off" : "file-text");
        row.createSpan({ cls: "mdpr-tree-name", text: node.name });
        if (hidden) {
          const folder = p.split("/").find((s) => s.startsWith("."));
          row.setAttr("aria-label", `In hidden folder "${folder}/" \u2014 review on GitHub`);
          row.onclick = () => new import_obsidian4.Notice(
            `${node.name} is in a hidden folder ("${folder}/"). Obsidian can't open it \u2014 review it on GitHub.`
          );
        } else {
          row.onclick = () => void this.plugin.openSessionFileByPath(p);
        }
      } else {
        const folderPath = `${prefix}${node.name}/`;
        const collapsed = this.treeCollapsed.has(folderPath);
        const row = parent.createDiv({ cls: "mdpr-tree-row mdpr-tree-folder" });
        row.style.paddingLeft = `${indent}px`;
        const icon = row.createSpan({ cls: "mdpr-tree-icon" });
        (0, import_obsidian4.setIcon)(icon, collapsed ? "chevron-right" : "chevron-down");
        row.createSpan({ cls: "mdpr-tree-name", text: node.name });
        row.onclick = () => {
          if (collapsed) this.treeCollapsed.delete(folderPath);
          else this.treeCollapsed.add(folderPath);
          this.render();
        };
        if (!collapsed) {
          this.renderTreeNodes(parent, node.children, depth + 1, folderPath, current);
        }
      }
    }
  }
  renderList(c, visible) {
    const list = c.createDiv({ cls: "mdpr-queue-list" });
    const activeNum = this.plugin.session?.prNumber;
    for (const pr of visible) {
      const row = list.createDiv({ cls: "mdpr-pr-row" });
      if (pr.number === activeNum) row.addClass("mdpr-active");
      if (this.plugin.isReviewed(pr.number)) row.addClass("mdpr-reviewed");
      const main = row.createDiv({ cls: "mdpr-pr-main" });
      main.createSpan({ cls: "mdpr-pr-number", text: `#${pr.number}` });
      main.createSpan({ cls: "mdpr-pr-title", text: pr.title });
      const meta = row.createDiv({ cls: "mdpr-pr-meta" });
      meta.createSpan({ cls: "mdpr-pr-author", text: pr.author?.login ?? "?" });
      const mdCount = markdownFiles(pr).length;
      meta.createSpan({ cls: "mdpr-pr-badge", text: `${mdCount} md` });
      if (this.plugin.isReviewed(pr.number)) {
        const check = meta.createSpan({
          cls: "mdpr-pr-check",
          attr: { "aria-label": "Reviewed" }
        });
        (0, import_obsidian4.setIcon)(check, "check");
      }
      row.onclick = () => void this.plugin.openPullRequest(pr);
    }
  }
};

// src/commentPanel.ts
var import_obsidian5 = require("obsidian");
var COMMENT_PANEL_VIEW_TYPE = "mdpr-comments";
var CommentPanelView = class extends import_obsidian5.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.collapsed = /* @__PURE__ */ new Set();
    this.plugin = plugin;
  }
  getViewType() {
    return COMMENT_PANEL_VIEW_TYPE;
  }
  getDisplayText() {
    return "PR comments";
  }
  getIcon() {
    return "message-square";
  }
  async onOpen() {
    this.render();
    void this.plugin.refreshPrLocal();
  }
  async onClose() {
  }
  render() {
    const c = this.contentEl;
    c.empty();
    c.addClass("mdpr-comments");
    const header = c.createDiv({ cls: "mdpr-comments-header" });
    header.createSpan({ cls: "mdpr-queue-title", text: "PR comments" });
    const actions = header.createDiv({ cls: "mdpr-header-actions" });
    const addBtn = actions.createEl("button", {
      cls: "mdpr-icon-btn",
      attr: { "aria-label": "Add comment from selection" }
    });
    (0, import_obsidian5.setIcon)(addBtn, "message-square-plus");
    addBtn.onclick = () => void this.plugin.addCommentFromSelection();
    if (this.plugin.session) {
      const postBtn = actions.createEl("button", {
        cls: "mdpr-icon-btn",
        attr: { "aria-label": `Post review to PR #${this.plugin.session.prNumber}` }
      });
      (0, import_obsidian5.setIcon)(postBtn, "send");
      postBtn.onclick = () => void this.plugin.postReviewToGitHub();
    }
    const session = this.plugin.session;
    if (!session && !this.plugin.activeDoc) {
      c.createDiv({
        cls: "mdpr-queue-status",
        text: "Open a PR from the queue, or a markdown file in a git repo."
      });
      return;
    }
    void this.plugin.loadOthersComments();
    const reviews = session ? this.plugin.prReviews() : [];
    const others = session ? this.plugin.othersAll() : [];
    const loading = this.plugin.othersLoadingNow();
    const unposted = this.mergeUnposted(
      session ? this.plugin.prUnposted() : [],
      this.activeDocUnposted()
    );
    this.renderReviewsWithComments(c, reviews, others, loading);
    this.renderUnposted(c, unposted);
    if (reviews.length === 0 && unposted.length === 0 && others.length === 0 && !loading) {
      c.createDiv({
        cls: "mdpr-queue-status",
        text: "No comments yet. Select text in the editor and add one."
      });
    }
  }
  activeDocUnposted() {
    const doc = this.plugin.activeDoc;
    if (!doc) return [];
    return this.plugin.activeCommentItems().filter((i) => !i.comment.postedAt).map((i) => ({ relPath: doc.relPath, comment: i.comment }));
  }
  mergeUnposted(a, b) {
    const seen = new Set(a.map((x) => x.comment.id));
    return [...a, ...b.filter((x) => !seen.has(x.comment.id))];
  }
  /** A collapsible section; returns the body element, or null when collapsed. */
  collapsible(parent, key, buildHeader, cls = "mdpr-section") {
    const collapsed = this.collapsed.has(key);
    const sec = parent.createDiv({ cls });
    const head = sec.createDiv({ cls: "mdpr-section-header" });
    const chev = head.createSpan({ cls: "mdpr-section-chev" });
    (0, import_obsidian5.setIcon)(chev, collapsed ? "chevron-right" : "chevron-down");
    buildHeader(head);
    head.onclick = () => {
      if (collapsed) this.collapsed.delete(key);
      else this.collapsed.add(key);
      this.render();
    };
    return collapsed ? null : sec.createDiv({ cls: "mdpr-section-body" });
  }
  sectionTitle(h, title, count) {
    h.createSpan({ cls: "mdpr-section-title", text: title });
    h.createSpan({ cls: "mdpr-section-count", text: String(count) });
  }
  renderReviewsWithComments(c, reviews, others, loading) {
    const reviewIds = new Set(reviews.map((r) => r.id));
    const byReview = /* @__PURE__ */ new Map();
    const orphans = [];
    for (const rc of others) {
      if (rc.reviewId != null && reviewIds.has(rc.reviewId)) {
        const arr = byReview.get(rc.reviewId) ?? [];
        arr.push(rc);
        byReview.set(rc.reviewId, arr);
      } else {
        orphans.push(rc);
      }
    }
    const shown = reviews.filter((r) => {
      const hasVerdict = r.body.trim() !== "" || r.state === "APPROVED" || r.state === "CHANGES_REQUESTED";
      return hasVerdict || (byReview.get(r.id)?.length ?? 0) > 0;
    });
    if (shown.length === 0 && orphans.length === 0 && !loading) return;
    const count = shown.length + (orphans.length ? 1 : 0);
    const body = this.collapsible(
      c,
      "reviews",
      (h) => this.sectionTitle(h, "PR reviews", count)
    );
    if (!body) return;
    if (loading && shown.length === 0 && orphans.length === 0) {
      body.createDiv({ cls: "mdpr-queue-status", text: "Loading\u2026" });
      return;
    }
    for (const r of shown) {
      const sub = this.collapsible(
        body,
        `review:${r.id}`,
        (h) => {
          h.createSpan({ cls: "mdpr-other-author", text: r.login });
          if (r.state) {
            h.createSpan({
              cls: `mdpr-review-state mdpr-state-${r.state.toLowerCase()}`,
              text: prettyState(r.state)
            });
          }
        },
        "mdpr-subsection"
      );
      if (!sub) continue;
      if (r.body.trim()) sub.createDiv({ cls: "mdpr-review-body", text: r.body });
      for (const rc of byReview.get(r.id) ?? []) this.renderInlineComment(sub, rc);
    }
    if (orphans.length) {
      const sub = this.collapsible(
        body,
        "review:orphan",
        (h) => {
          h.createSpan({ cls: "mdpr-other-author", text: "Comments" });
          h.createSpan({ cls: "mdpr-section-count", text: String(orphans.length) });
        },
        "mdpr-subsection"
      );
      if (sub) for (const rc of orphans) this.renderInlineComment(sub, rc);
    }
  }
  renderInlineComment(parent, rc) {
    const row = parent.createDiv({
      cls: "mdpr-comment-row mdpr-other-row",
      attr: { "data-mdpr-other-row": String(rc.id) }
    });
    const head = row.createDiv({ cls: "mdpr-other-head" });
    head.createSpan({
      cls: "mdpr-file-label",
      text: fileBase(rc.path),
      attr: { "aria-label": rc.path }
    });
    if (rc.line) head.createSpan({ cls: "mdpr-other-line", text: `L${rc.line}` });
    row.createDiv({ cls: "mdpr-comment-body", text: rc.body });
    if (rc.line != null) {
      const act = row.createDiv({ cls: "mdpr-comment-actions" });
      const line = rc.line;
      const path5 = rc.path;
      this.iconButton(
        act,
        "crosshair",
        "Open file at line",
        () => void this.plugin.openFileAndJumpLine(path5, line)
      );
    }
  }
  renderUnposted(c, unposted) {
    if (unposted.length === 0) return;
    const body = this.collapsible(
      c,
      "unposted",
      (h) => this.sectionTitle(h, "Unposted comments", unposted.length)
    );
    if (!body) return;
    const byFile = /* @__PURE__ */ new Map();
    for (const u of unposted) {
      const arr = byFile.get(u.relPath) ?? [];
      arr.push(u);
      byFile.set(u.relPath, arr);
    }
    for (const [relPath, list] of byFile) {
      const sub = this.collapsible(
        body,
        `unposted:${relPath}`,
        (h) => {
          h.createSpan({
            cls: "mdpr-file-label",
            text: fileBase(relPath),
            attr: { "aria-label": relPath }
          });
          h.createSpan({ cls: "mdpr-section-count", text: String(list.length) });
        },
        "mdpr-subsection"
      );
      if (!sub) continue;
      for (const u of list) this.renderLocalComment(sub, u.relPath, u.comment);
    }
  }
  renderLocalComment(list, relPath, comment) {
    const row = list.createDiv({
      cls: "mdpr-comment-row",
      attr: { "data-mdpr-row": comment.id }
    });
    if (comment.status === "resolved") row.addClass("mdpr-resolved");
    row.createDiv({ cls: "mdpr-comment-quote", text: truncate2(comment.anchor.quote, 90) });
    row.createDiv({ cls: "mdpr-comment-body", text: comment.body });
    if (comment.placement) {
      const tags = row.createDiv({ cls: "mdpr-comment-tags" });
      tags.createSpan({
        cls: `mdpr-place-tag mdpr-place-${comment.placement}`,
        text: comment.placement === "inline" ? "inline" : "fallback"
      });
    }
    const actions = row.createDiv({ cls: "mdpr-comment-actions" });
    const id = comment.id;
    this.iconButton(
      actions,
      "crosshair",
      "Open file at comment",
      () => void this.plugin.openFileAndJumpAnchor(relPath, comment)
    );
    const resolved = comment.status === "resolved";
    this.iconButton(
      actions,
      resolved ? "rotate-ccw" : "check",
      resolved ? "Reopen" : "Resolve",
      () => void this.plugin.toggleResolveAt(relPath, id)
    );
    this.iconButton(actions, "pencil", "Edit", () => this.plugin.editCommentAt(relPath, id));
    this.iconButton(
      actions,
      "trash-2",
      "Delete",
      () => void this.plugin.deleteCommentAt(relPath, id)
    );
  }
  /** Flash a local comment (editor-click reveal); expands its file group. */
  highlight(id) {
    const relPath = this.plugin.activeDoc?.relPath;
    this.collapsed.delete("unposted");
    if (relPath) this.collapsed.delete(`unposted:${relPath}`);
    this.render();
    this.flash(`.mdpr-comment-row[data-mdpr-row="${id}"]`);
  }
  /** Expand the review holding another reviewer's comment and flash it. */
  revealOther(id) {
    const rc = this.plugin.othersAll().find((c) => String(c.id) === id);
    if (!rc) return;
    const reviewIds = new Set(this.plugin.prReviews().map((r) => r.id));
    const key = rc.reviewId != null && reviewIds.has(rc.reviewId) ? `review:${rc.reviewId}` : "review:orphan";
    this.collapsed.delete("reviews");
    this.collapsed.delete(key);
    this.render();
    this.flash(`.mdpr-comment-row[data-mdpr-other-row="${id}"]`);
  }
  flash(selector) {
    this.contentEl.querySelectorAll(".mdpr-comment-row.mdpr-flash").forEach((el) => el.removeClass("mdpr-flash"));
    const row = this.contentEl.querySelector(selector);
    if (!row) return;
    row.addClass("mdpr-flash");
    row.scrollIntoView({ block: "center", behavior: "smooth" });
  }
  iconButton(parent, icon, label, onClick) {
    const b = parent.createEl("button", {
      cls: "mdpr-icon-btn",
      attr: { "aria-label": label }
    });
    (0, import_obsidian5.setIcon)(b, icon);
    b.onclick = onClick;
  }
};
function truncate2(s, n) {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > n ? flat.slice(0, n) + "\u2026" : flat;
}
function fileBase(path5) {
  return path5.split("/").pop() ?? path5;
}
function prettyState(state) {
  switch (state) {
    case "APPROVED":
      return "approved";
    case "CHANGES_REQUESTED":
      return "changes requested";
    case "COMMENTED":
      return "commented";
    case "DISMISSED":
      return "dismissed";
    default:
      return state.toLowerCase();
  }
}

// src/commentExtension.ts
var import_state3 = require("@codemirror/state");
var import_view3 = require("@codemirror/view");
var setCommentRanges = import_state3.StateEffect.define();
var setOtherRanges = import_state3.StateEffect.define();
function ownMark(id, resolved) {
  return import_view3.Decoration.mark({
    class: resolved ? "mdpr-comment-mark mdpr-comment-resolved" : "mdpr-comment-mark",
    attributes: { "data-mdpr-comment": id }
  });
}
function otherMark(id) {
  return import_view3.Decoration.mark({
    class: "mdpr-other-mark",
    attributes: { "data-mdpr-other": id }
  });
}
var clickHandler = null;
var otherClickHandler = null;
function setCommentClickHandler(fn) {
  clickHandler = fn;
}
function setOtherClickHandler(fn) {
  otherClickHandler = fn;
}
var commentField = import_state3.StateField.define({
  create() {
    return import_view3.Decoration.none;
  },
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(setCommentRanges)) {
        const ranges = [];
        for (const r of e.value) {
          if (r.to > r.from) ranges.push(ownMark(r.id, r.resolved).range(r.from, r.to));
        }
        deco = import_view3.Decoration.set(ranges, true);
      }
    }
    return deco;
  },
  provide: (f) => import_view3.EditorView.decorations.from(f)
});
var otherField = import_state3.StateField.define({
  create() {
    return import_view3.Decoration.none;
  },
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(setOtherRanges)) {
        const ranges = [];
        for (const r of e.value) {
          if (r.to > r.from) ranges.push(otherMark(r.id).range(r.from, r.to));
        }
        deco = import_view3.Decoration.set(ranges, true);
      }
    }
    return deco;
  },
  provide: (f) => import_view3.EditorView.decorations.from(f)
});
function idAt(view, field, from, to, attr) {
  const set = view.state.field(field, false);
  if (!set) return null;
  let found = null;
  set.between(from, to, (_f, _t, value) => {
    const attrs = value.spec?.attributes;
    const id = attrs?.[attr];
    if (id) {
      found = id;
      return false;
    }
  });
  return found;
}
var commentClicks = import_view3.EditorView.domEventHandlers({
  mousedown(event, view) {
    if (!clickHandler && !otherClickHandler) return false;
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos == null) return false;
    const line = view.state.doc.lineAt(pos);
    const own = idAt(view, commentField, line.from, line.to, "data-mdpr-comment");
    if (own && clickHandler) {
      clickHandler(own);
      return false;
    }
    const other = idAt(view, otherField, line.from, line.to, "data-mdpr-other");
    if (other && otherClickHandler) otherClickHandler(other);
    return false;
  }
});
var commentExtension = [commentField, otherField, commentClicks];
function setComments(view, ranges) {
  view.dispatch({ effects: setCommentRanges.of(ranges) });
}
function setOtherComments(view, ranges) {
  view.dispatch({ effects: setOtherRanges.of(ranges) });
}

// src/sidecar.ts
var import_fs3 = require("fs");
var path3 = __toESM(require("path"), 1);
var SIDECAR_VERSION = 1;
function emptySidecar(doc) {
  return { version: SIDECAR_VERSION, doc, comments: [] };
}
function sidecarPath(repoRoot, sidecarDir, relPath) {
  return path3.join(repoRoot, sidecarDir, `${relPath}.review.json`);
}
async function loadSidecar(repoRoot, sidecarDir, relPath) {
  try {
    const raw = await import_fs3.promises.readFile(sidecarPath(repoRoot, sidecarDir, relPath), "utf8");
    const data = JSON.parse(raw);
    data.comments = Array.isArray(data.comments) ? data.comments : [];
    data.doc = relPath;
    return data;
  } catch {
    return emptySidecar(relPath);
  }
}
async function saveSidecar(repoRoot, sidecarDir, relPath, sc) {
  const p = sidecarPath(repoRoot, sidecarDir, relPath);
  if (sc.comments.length === 0) {
    await import_fs3.promises.unlink(p).catch(() => void 0);
    return;
  }
  await import_fs3.promises.mkdir(path3.dirname(p), { recursive: true });
  await import_fs3.promises.writeFile(p, JSON.stringify(sc, null, 2) + "\n", "utf8");
}

// src/commentModal.ts
var import_obsidian6 = require("obsidian");
var CommentModal = class extends import_obsidian6.Modal {
  constructor(app, opts) {
    super(app);
    this.value = opts.initial ?? "";
    this.quote = opts.quote;
    this.onSubmit = opts.onSubmit;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: this.value ? "Edit comment" : "Add comment" });
    if (this.quote) {
      contentEl.createDiv({
        cls: "mdpr-modal-quote",
        text: this.quote.length > 200 ? this.quote.slice(0, 200) + "\u2026" : this.quote
      });
    }
    let area = null;
    new import_obsidian6.Setting(contentEl).setName("Comment").addTextArea((t) => {
      area = t;
      t.setValue(this.value);
      t.onChange((v) => this.value = v);
      t.inputEl.rows = 5;
      t.inputEl.addClass("mdpr-modal-textarea");
    });
    new import_obsidian6.Setting(contentEl).addButton(
      (b) => b.setButtonText("Cancel").onClick(() => {
        this.onSubmit(null);
        this.close();
      })
    ).addButton(
      (b) => b.setButtonText("Save").setCta().onClick(() => {
        this.onSubmit(this.value.trim() || null);
        this.close();
      })
    );
    window.setTimeout(() => area?.inputEl.focus(), 0);
  }
  onClose() {
    this.contentEl.empty();
  }
};

// src/main.ts
var sleep2 = (ms) => new Promise((r) => setTimeout(r, ms));
function genId() {
  return "c_" + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
}
async function realpathSafe(p) {
  try {
    return await import_fs4.promises.realpath(p);
  } catch {
    return p;
  }
}
function changedLineSet2(doc, result) {
  const set = /* @__PURE__ */ new Set();
  const clampN = (n) => n < 0 ? 0 : n > doc.length ? doc.length : n;
  for (const span of result.spans) {
    const from = clampN(span.fromB);
    const to = clampN(span.toB);
    const start = doc.lineAt(from).number;
    const end = doc.lineAt(to > from ? to - 1 : from).number;
    for (let n = start; n <= end; n++) set.add(n);
  }
  for (const offset of result.deletions) set.add(doc.lineAt(clampN(offset)).number);
  return set;
}
var MdPrReviewPlugin = class extends import_obsidian7.Plugin {
  constructor() {
    super(...arguments);
    this.session = null;
    this.reviewed = /* @__PURE__ */ new Set();
    this.activeDoc = null;
    this.selectedRepo = null;
    this.activeItems = [];
    this.currentRepoRoot = null;
    this.activeFileKey = null;
    this.othersComments = /* @__PURE__ */ new Map();
    this.reviewsByPr = /* @__PURE__ */ new Map();
    this.othersLoading = /* @__PURE__ */ new Set();
    this.prLocal = [];
  }
  async onload() {
    await this.loadPersisted();
    setLineBackground(this.settings.highlightLineBackground);
    this.registerEditorExtension([diffExtension, commentExtension]);
    this.registerView(PR_QUEUE_VIEW_TYPE, (leaf) => new PrQueueView(leaf, this));
    this.registerView(
      COMMENT_PANEL_VIEW_TYPE,
      (leaf) => new CommentPanelView(leaf, this)
    );
    this.addSettingTab(new MdPrReviewSettingTab(this.app, this));
    this.addRibbonIcon("git-pull-request", "Open PR review queue", () => {
      void this.activateQueueView();
    });
    this.addRibbonIcon("git-compare", "Toggle PR diff highlight", () => {
      void this.toggleDiffGlobal();
    });
    this.addRibbonIcon("message-square", "Open PR comments panel", () => {
      void this.activateView(COMMENT_PANEL_VIEW_TYPE);
    });
    this.addCommand({
      id: "open-pr-queue",
      name: "Open PR review queue",
      callback: () => void this.activateQueueView()
    });
    this.addCommand({
      id: "open-comments-panel",
      name: "Open PR comments panel",
      callback: () => void this.activateView(COMMENT_PANEL_VIEW_TYPE)
    });
    this.addCommand({
      id: "add-comment",
      name: "Add comment from selection",
      checkCallback: (checking) => {
        const view = this.app.workspace.getActiveViewOfType(import_obsidian7.MarkdownView);
        if (!view || view.file == null) return false;
        if (!checking) void this.addCommentFromSelection();
        return true;
      }
    });
    this.addCommand({
      id: "post-review",
      name: "Post review to GitHub",
      checkCallback: (checking) => {
        if (!this.session) return false;
        if (!checking) void this.postReviewToGitHub();
        return true;
      }
    });
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        void this.onActiveFileChanged();
      })
    );
    this.app.workspace.onLayoutReady(() => {
      void this.onActiveFileChanged();
      void this.refreshPrLocal();
    });
    setCommentClickHandler((id) => void this.revealComment(id));
    setOtherClickHandler((id) => void this.revealOtherComment(id));
    this.addCommand({
      id: "toggle-pr-diff-highlight",
      name: "Toggle PR diff highlight",
      callback: () => void this.toggleDiffGlobal()
    });
    this.addCommand({
      id: "next-pr-file",
      name: "Next file in current PR",
      checkCallback: (checking) => {
        if (!this.session || this.session.mdFiles.length === 0) return false;
        if (!checking) void this.openAdjacentFile(1);
        return true;
      }
    });
    this.addCommand({
      id: "prev-pr-file",
      name: "Previous file in current PR",
      checkCallback: (checking) => {
        if (!this.session || this.session.mdFiles.length === 0) return false;
        if (!checking) void this.openAdjacentFile(-1);
        return true;
      }
    });
  }
  onunload() {
  }
  /* --------------------------------------------------------------------- */
  /* Diff highlight                                                          */
  /* --------------------------------------------------------------------- */
  cmOf(view) {
    const cm = view.editor.cm;
    return cm ?? null;
  }
  absPathOf(file) {
    const adapter = this.app.vault.adapter;
    return adapter instanceof import_obsidian7.FileSystemAdapter ? path4.join(adapter.getBasePath(), file.path) : null;
  }
  /** Flip the global diff-highlight state and apply it to every open editor. */
  async toggleDiffGlobal() {
    this.settings.diffEnabled = !this.settings.diffEnabled;
    await this.saveSettings();
    new import_obsidian7.Notice(this.settings.diffEnabled ? "PR diff highlight on" : "PR diff highlight off");
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      const view = leaf.view;
      if (view instanceof import_obsidian7.MarkdownView) await this.applyDiffToView(view);
    }
  }
  /** Apply the current global diff state to a view — silently (no per-file notices). */
  async applyDiffToView(view) {
    if (this.settings.diffEnabled) {
      const baseRef = this.session ? this.session.baseRef : this.settings.baseRefFallback;
      await this.enableDiffForView(view, baseRef, { silent: true });
    } else {
      const cm = this.cmOf(view);
      if (cm) disableDiff(cm);
    }
  }
  /** Resolve the base for `view`'s file and turn the diff on. Silent unless asked. */
  async enableDiffForView(view, baseRef, opts = {}) {
    let cm = this.cmOf(view);
    for (let i = 0; i < 6 && !cm; i++) {
      await sleep2(120);
      cm = this.cmOf(view);
    }
    const file = view.file;
    if (!cm || !file) return;
    const abs = this.absPathOf(file);
    if (!abs) return;
    try {
      const loc = await locate(this.settings.gitPath, abs);
      const base = await resolveBase(this.settings.gitPath, loc, baseRef);
      enableDiff(cm, base.baseText);
    } catch (e) {
      if (!opts.silent) {
        new import_obsidian7.Notice(`PR diff failed: ${e instanceof GitError ? e.message : String(e)}`);
      }
      console.error("[markdown-pr-review] enableDiffForView", e);
    }
  }
  refreshDiffHighlights() {
    setLineBackground(this.settings.highlightLineBackground);
    this.app.workspace.getLeavesOfType("markdown").forEach((leaf) => {
      const view = leaf.view;
      if (view instanceof import_obsidian7.MarkdownView) {
        const cm = this.cmOf(view);
        if (cm) retriggerDiff(cm);
      }
    });
  }
  /* --------------------------------------------------------------------- */
  /* PR queue                                                               */
  /* --------------------------------------------------------------------- */
  async activateQueueView() {
    await this.activateView(PR_QUEUE_VIEW_TYPE);
  }
  async activateView(viewType) {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(viewType)[0] ?? null;
    if (!leaf) {
      leaf = workspace.getRightLeaf(false);
      if (leaf) await leaf.setViewState({ type: viewType, active: true });
    }
    if (leaf) workspace.revealLeaf(leaf);
  }
  /**
   * Find every git repo reachable from the vault: the vault root itself, plus
   * each top-level folder (following symlinks, so symlinked repos are found).
   */
  async discoverRepos() {
    const adapter = this.app.vault.adapter;
    if (!(adapter instanceof import_obsidian7.FileSystemAdapter)) return [];
    const base = adapter.getBasePath();
    const out = [];
    const seen = /* @__PURE__ */ new Set();
    const baseRoot = await repoRootOf(this.settings.gitPath, base);
    if (baseRoot) {
      seen.add(baseRoot);
      out.push({ name: "(vault root)", vaultMount: "", repoRoot: baseRoot });
    }
    let entries = [];
    try {
      entries = await import_fs4.promises.readdir(base, { withFileTypes: true });
    } catch {
    }
    for (const e of entries) {
      if (e.name.startsWith(".")) continue;
      const childPath = path4.join(base, e.name);
      let isDir = e.isDirectory();
      if (e.isSymbolicLink()) {
        try {
          isDir = (await import_fs4.promises.stat(childPath)).isDirectory();
        } catch {
          isDir = false;
        }
      }
      if (!isDir) continue;
      const root = await repoRootOf(this.settings.gitPath, childPath);
      if (root && !seen.has(root)) {
        seen.add(root);
        out.push({ name: e.name, vaultMount: e.name, repoRoot: root });
      }
    }
    return out;
  }
  async setSelectedRepo(ref) {
    const changed = ref?.repoRoot !== this.selectedRepo?.repoRoot;
    this.selectedRepo = ref;
    this.currentRepoRoot = ref?.repoRoot ?? null;
    if (changed) this.session = null;
    await this.persist();
    if (changed) this.refreshQueueView();
  }
  async openPullRequest(pr) {
    const repo = this.selectedRepo;
    if (!repo) {
      new import_obsidian7.Notice("Attach a repository in the PR queue first.");
      return;
    }
    try {
      if (await isTreeDirty(this.settings.gitPath, repo.repoRoot)) {
        const files = await dirtyFiles(this.settings.gitPath, repo.repoRoot);
        const ok = await new Promise((resolve) => {
          new ConfirmModal(this.app, {
            title: `Uncommitted changes in ${repo.name}`,
            build: (el) => {
              el.createEl("p", {
                text: `${files.length} file(s) have uncommitted changes \u2014 often Obsidian reformatting a file you're reviewing:`
              });
              const ul = el.createEl("ul");
              for (const f of files.slice(0, 12)) ul.createEl("li", { text: f });
              if (files.length > 12) {
                el.createEl("p", { text: `\u2026and ${files.length - 12} more` });
              }
              el.createEl("p", {
                cls: "mdpr-modal-sub",
                text: "Stash them and switch? Recover anytime with `git stash pop`."
              });
            },
            confirmText: "Stash & switch",
            onResult: resolve
          }).open();
        });
        if (!ok) return;
        const stashed = await stashTracked(
          this.settings.gitPath,
          repo.repoRoot,
          `markdown-pr-review: before PR #${pr.number}`
        );
        if (!stashed) {
          new import_obsidian7.Notice("Stash failed \u2014 not switching.");
          return;
        }
      }
    } catch (e) {
      console.error("[markdown-pr-review] dirty check", e);
    }
    new import_obsidian7.Notice(`Checking out PR #${pr.number}\u2026`);
    try {
      await checkoutPullRequest(this.settings.ghPath, repo.repoRoot, pr.number);
    } catch (e) {
      new import_obsidian7.Notice(`Checkout failed: ${e.message}`);
      return;
    }
    this.currentRepoRoot = repo.repoRoot;
    this.session = {
      repoRoot: repo.repoRoot,
      vaultMount: repo.vaultMount,
      prNumber: pr.number,
      baseRef: `${this.settings.remote}/${pr.baseRefName}`,
      headRefName: pr.headRefName,
      mdFiles: markdownFiles(pr).map((f) => f.path),
      fileIndex: 0,
      seenFiles: []
    };
    await this.persist();
    this.refreshQueueView();
    void this.loadOthersComments();
    void this.refreshPrLocal();
    if (this.session.mdFiles.length === 0) {
      new import_obsidian7.Notice(`PR #${pr.number} changes no markdown files.`);
      return;
    }
    await this.openSessionFile(0);
  }
  async openAdjacentFile(delta) {
    const s = this.session;
    if (!s) return;
    const next = s.fileIndex + delta;
    if (next < 0 || next >= s.mdFiles.length) {
      new import_obsidian7.Notice("No more files in this PR.");
      return;
    }
    await this.openSessionFile(next);
  }
  async openSessionFileByPath(relPath) {
    const s = this.session;
    if (!s) return;
    const idx = s.mdFiles.indexOf(relPath);
    if (idx >= 0) await this.openSessionFile(idx);
  }
  isFileSeen(relPath) {
    return this.session?.seenFiles?.includes(relPath) ?? false;
  }
  async openSessionFile(index) {
    const s = this.session;
    if (!s || index < 0 || index >= s.mdFiles.length) return;
    s.fileIndex = index;
    const relPath = s.mdFiles[index];
    if (!s.seenFiles) s.seenFiles = [];
    if (!s.seenFiles.includes(relPath)) s.seenFiles.push(relPath);
    await this.persist();
    await this.openPrFile(relPath, s.baseRef);
    const openable = s.mdFiles.filter((f) => !isHiddenPath(f));
    if (openable.length > 0 && openable.every((f) => s.seenFiles.includes(f))) {
      this.markReviewed(s.prNumber);
    }
    this.refreshQueueView();
  }
  async openPrFile(relPath, baseRef) {
    const s = this.session;
    if (!s) return;
    const file = await this.findVaultFile(s.repoRoot, s.vaultMount, relPath);
    if (!file) {
      const hidden = relPath.split("/").find((seg) => seg.startsWith("."));
      new import_obsidian7.Notice(
        hidden ? `Obsidian doesn't index hidden folders, so ${relPath} can't be opened (folder "${hidden}/").` : `Could not find ${relPath} in the vault.`
      );
      return;
    }
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.openFile(file);
    const view = leaf.view;
    if (view instanceof import_obsidian7.MarkdownView) {
      await this.applyDiffToView(view);
    }
  }
  /**
   * Find the vault file for a repo-relative path. Tries the session's vault
   * mount first, then falls back to matching any vault file whose real
   * (symlink-resolved) path equals repoRoot/relPath — so a repo symlinked under
   * a different folder name (or a stale mount) still resolves.
   */
  async findVaultFile(repoRoot, vaultMount, relPath) {
    const direct = vaultMount ? `${vaultMount.replace(/\/+$/, "")}/${relPath}` : relPath;
    const quick = await this.getFileWithRetry(direct, 4);
    if (quick) return quick;
    const realTarget = await realpathSafe(path4.join(repoRoot, relPath));
    const suffix = "/" + relPath;
    const candidates = this.app.vault.getFiles().filter((f) => f.path === relPath || f.path.endsWith(suffix));
    for (const c of candidates) {
      const abs = this.absPathOf(c);
      if (!abs) continue;
      if (await realpathSafe(abs) === realTarget) return c;
    }
    return candidates.length === 1 ? candidates[0] : null;
  }
  async getFileWithRetry(vaultRel, tries = 6) {
    for (let i = 0; i < tries; i++) {
      const f = this.app.vault.getAbstractFileByPath(vaultRel);
      if (f instanceof import_obsidian7.TFile) return f;
      await sleep2(250);
    }
    return null;
  }
  isReviewed(prNumber) {
    return this.reviewed.has(`${this.currentRepoRoot ?? ""}#${prNumber}`);
  }
  markReviewed(prNumber) {
    const root = this.currentRepoRoot ?? this.session?.repoRoot ?? "";
    this.reviewed.add(`${root}#${prNumber}`);
    void this.persist();
  }
  refreshQueueView() {
    this.app.workspace.getLeavesOfType(PR_QUEUE_VIEW_TYPE).forEach((leaf) => {
      if (leaf.view instanceof PrQueueView) leaf.view.render();
    });
  }
  /* --------------------------------------------------------------------- */
  /* Comments                                                               */
  /* --------------------------------------------------------------------- */
  activeMarkdownView() {
    const recent = this.app.workspace.getMostRecentLeaf();
    if (recent?.view instanceof import_obsidian7.MarkdownView) return recent.view;
    return this.app.workspace.getActiveViewOfType(import_obsidian7.MarkdownView);
  }
  async onActiveFileChanged() {
    const view = this.activeMarkdownView();
    const file = view?.file;
    const abs = file ? this.absPathOf(file) : null;
    if (abs === this.activeFileKey) return;
    this.activeFileKey = abs;
    if (!view || !file || !abs) {
      this.activeDoc = null;
      this.activeItems = [];
      this.refreshCommentPanel();
      return;
    }
    try {
      const loc = await locate(this.settings.gitPath, abs);
      const sidecar = await loadSidecar(
        loc.repoRoot,
        this.settings.sidecarDir,
        loc.relPath
      );
      this.activeDoc = { repoRoot: loc.repoRoot, relPath: loc.relPath, sidecar };
    } catch {
      this.activeDoc = null;
      this.activeItems = [];
      this.refreshCommentPanel();
      return;
    }
    this.refreshComments();
    void this.refreshPrLocal();
    if (view instanceof import_obsidian7.MarkdownView) void this.applyDiffToView(view);
  }
  /** Re-resolve anchors against the live editor and push marks + panel. */
  refreshComments() {
    const view = this.activeMarkdownView();
    const cm = view ? this.cmOf(view) : null;
    if (!this.activeDoc) {
      this.activeItems = [];
    } else if (!cm) {
      this.activeItems = this.activeDoc.sidecar.comments.map((comment) => ({
        comment,
        range: null
      }));
    } else {
      const docText = cm.state.doc.toString();
      this.activeItems = this.activeDoc.sidecar.comments.map((comment) => ({
        comment,
        range: resolveAnchor(docText, comment.anchor)
      }));
      setComments(
        cm,
        this.activeItems.filter((i) => i.range && !i.comment.postedAt).map((i) => ({
          id: i.comment.id,
          from: i.range.from,
          to: i.range.to,
          resolved: i.comment.status === "resolved"
        }))
      );
      const doc = cm.state.doc;
      setOtherComments(
        cm,
        this.othersForActiveDoc().filter((o) => o.line != null).map((o) => {
          const n = Math.min(Math.max(o.line, 1), doc.lines);
          const l = doc.line(n);
          return { id: String(o.id), from: l.from, to: l.to };
        })
      );
    }
    this.refreshCommentPanel();
  }
  activeCommentItems() {
    return this.activeItems;
  }
  /* ---- Others' comments (existing GitHub review comments) ---- */
  sessionKey() {
    const s = this.session;
    return s ? `${s.repoRoot}#${s.prNumber}` : null;
  }
  othersForActiveDoc() {
    const key = this.sessionKey();
    const doc = this.activeDoc;
    if (!key || !doc) return [];
    const all = this.othersComments.get(key);
    if (!all) return [];
    return all.filter((c) => c.path === doc.relPath).sort(
      (a, b) => (a.line ?? 0) - (b.line ?? 0) || a.createdAt.localeCompare(b.createdAt)
    );
  }
  /** All of the PR's other-reviewer inline comments, across files. */
  othersAll() {
    const key = this.sessionKey();
    if (!key) return [];
    return (this.othersComments.get(key) ?? []).slice().sort(
      (a, b) => a.path.localeCompare(b.path) || (a.line ?? 0) - (b.line ?? 0) || a.createdAt.localeCompare(b.createdAt)
    );
  }
  /** Your un-posted local comments across every file in the PR. */
  prUnposted() {
    return this.prLocal.filter((x) => !x.comment.postedAt);
  }
  /** Reload local sidecars for all of the PR's files (for the PR-wide panel). */
  async refreshPrLocal() {
    const s = this.session;
    if (!s) {
      this.prLocal = [];
      this.refreshCommentPanel();
      return;
    }
    const out = [];
    for (const rel of s.mdFiles) {
      if (isHiddenPath(rel)) continue;
      const comments = this.activeDoc && this.activeDoc.relPath === rel ? this.activeDoc.sidecar.comments : (await loadSidecar(s.repoRoot, this.settings.sidecarDir, rel)).comments;
      for (const c of comments) out.push({ relPath: rel, comment: c });
    }
    this.prLocal = out;
    this.refreshCommentPanel();
  }
  othersLoadingNow() {
    const key = this.sessionKey();
    return !!key && this.othersLoading.has(key) && !this.othersComments.has(key);
  }
  prReviews() {
    const key = this.sessionKey();
    return key ? this.reviewsByPr.get(key) ?? [] : [];
  }
  hiddenAuthorPatterns() {
    return this.settings.hideCommentsFrom.split(",").map((p) => p.trim().toLowerCase()).filter(Boolean);
  }
  isHiddenAuthor(login) {
    const l = login.toLowerCase();
    return this.hiddenAuthorPatterns().some((p) => l.includes(p));
  }
  async loadOthersComments(force = false) {
    const s = this.session;
    const key = this.sessionKey();
    if (!s || !key) return;
    if (!force && (this.othersComments.has(key) || this.othersLoading.has(key))) return;
    this.othersLoading.add(key);
    this.refreshCommentPanel();
    try {
      const target = await repoTarget(this.settings.ghPath, s.repoRoot);
      if (!target) return;
      const [comments, reviews] = await Promise.all([
        listReviewComments(this.settings.ghPath, target.host, target.nameWithOwner, s.prNumber),
        listReviews(this.settings.ghPath, target.host, target.nameWithOwner, s.prNumber)
      ]);
      this.othersComments.set(
        key,
        comments.filter((c) => !this.isHiddenAuthor(c.login))
      );
      this.reviewsByPr.set(
        key,
        reviews.filter((r) => !this.isHiddenAuthor(r.login))
      );
    } catch (e) {
      console.error("[markdown-pr-review] loadOthersComments", e);
    } finally {
      this.othersLoading.delete(key);
      this.refreshComments();
    }
  }
  revealOtherComment(id) {
    this.app.workspace.getLeavesOfType(COMMENT_PANEL_VIEW_TYPE).forEach((leaf) => {
      if (leaf.view instanceof CommentPanelView) {
        this.app.workspace.revealLeaf(leaf);
        leaf.view.revealOther(id);
      }
    });
  }
  jumpToLine(line) {
    const view = this.activeMarkdownView();
    const cm = view ? this.cmOf(view) : null;
    if (!cm) return;
    const n = Math.min(Math.max(line, 1), cm.state.doc.lines);
    const l = cm.state.doc.line(n);
    cm.dispatch({ selection: { anchor: l.from, head: l.to }, scrollIntoView: true });
    cm.focus();
  }
  /* ---- Cross-file navigation (PR-wide panel) ---- */
  async ensureFileOpen(relPath) {
    const s = this.session;
    if (!s) return;
    if (this.activeDoc?.relPath === relPath) {
      const v = this.activeMarkdownView();
      if (v && this.cmOf(v)) return;
    }
    await this.openPrFile(relPath, s.baseRef);
  }
  async openFileAndJumpLine(relPath, line) {
    await this.ensureFileOpen(relPath);
    this.jumpToLine(line);
  }
  async openFileAndJumpAnchor(relPath, comment) {
    await this.ensureFileOpen(relPath);
    const view = this.activeMarkdownView();
    const cm = view ? this.cmOf(view) : null;
    if (!cm) return;
    const r = resolveAnchor(cm.state.doc.toString(), comment.anchor);
    if (!r) {
      new import_obsidian7.Notice("Anchor not found \u2014 the text may have changed (stale).");
      return;
    }
    cm.dispatch({ selection: { anchor: r.from, head: r.to }, scrollIntoView: true });
    cm.focus();
  }
  /* ---- Local comment mutations by path (work across the PR's files) ---- */
  async withSidecar(relPath, mutate) {
    const repoRoot = this.session?.repoRoot ?? this.activeDoc?.repoRoot;
    if (!repoRoot) return;
    if (this.activeDoc && this.activeDoc.relPath === relPath) {
      if (mutate(this.activeDoc.sidecar)) {
        await this.saveActiveSidecar();
        this.refreshComments();
      }
    } else {
      const sc = await loadSidecar(repoRoot, this.settings.sidecarDir, relPath);
      if (mutate(sc)) {
        await saveSidecar(repoRoot, this.settings.sidecarDir, relPath, sc);
      }
    }
    await this.refreshPrLocal();
  }
  editCommentAt(relPath, id) {
    const comment = this.prLocal.find(
      (x) => x.relPath === relPath && x.comment.id === id
    )?.comment;
    if (!comment) return;
    new CommentModal(this.app, {
      initial: comment.body,
      quote: comment.anchor.quote,
      onSubmit: async (body) => {
        if (!body) return;
        await this.withSidecar(relPath, (sc) => {
          const c = sc.comments.find((c2) => c2.id === id);
          if (!c) return false;
          c.body = body;
          return true;
        });
      }
    }).open();
  }
  async toggleResolveAt(relPath, id) {
    await this.withSidecar(relPath, (sc) => {
      const c = sc.comments.find((c2) => c2.id === id);
      if (!c) return false;
      c.status = c.status === "resolved" ? "open" : "resolved";
      return true;
    });
  }
  async deleteCommentAt(relPath, id) {
    await this.withSidecar(relPath, (sc) => {
      const before = sc.comments.length;
      sc.comments = sc.comments.filter((c) => c.id !== id);
      return sc.comments.length !== before;
    });
  }
  refreshCommentPanel() {
    this.app.workspace.getLeavesOfType(COMMENT_PANEL_VIEW_TYPE).forEach((leaf) => {
      if (leaf.view instanceof CommentPanelView) leaf.view.render();
    });
  }
  /** Reveal a comment in the panel (driven by clicking its line in the editor). */
  async revealComment(id) {
    let leaf = this.app.workspace.getLeavesOfType(COMMENT_PANEL_VIEW_TYPE)[0] ?? null;
    if (!leaf) {
      const right = this.app.workspace.getRightLeaf(false);
      if (right) {
        await right.setViewState({ type: COMMENT_PANEL_VIEW_TYPE, active: false });
        leaf = right;
      }
    }
    if (!leaf) return;
    this.app.workspace.revealLeaf(leaf);
    if (leaf.view instanceof CommentPanelView) leaf.view.highlight(id);
  }
  async saveActiveSidecar() {
    if (!this.activeDoc) return;
    if (this.activeDoc.sidecar.comments.length > 0) {
      await this.classifyActiveComments();
    }
    await saveSidecar(
      this.activeDoc.repoRoot,
      this.settings.sidecarDir,
      this.activeDoc.relPath,
      this.activeDoc.sidecar
    );
  }
  /**
   * Diff the active doc against its base and tag each comment as `inline`
   * (anchor lands on a changed line -> can be a GitHub inline review comment)
   * or `fallback` (unchanged line -> needs a PR-level comment), and resolve a
   * 1-based line number. This makes the sidecar a complete contract for the
   * /post-review skill.
   */
  async classifyActiveComments() {
    const doc = this.activeDoc;
    if (!doc) return;
    const view = this.activeMarkdownView();
    const cm = view ? this.cmOf(view) : null;
    if (!cm) return;
    const baseRef = doc.sidecar.base ?? this.settings.baseRefFallback;
    let baseText;
    try {
      const base = await resolveBase(
        this.settings.gitPath,
        { repoRoot: doc.repoRoot, relPath: doc.relPath, dir: doc.repoRoot },
        baseRef
      );
      baseText = base.baseText;
    } catch (e) {
      console.error("[markdown-pr-review] classify: base resolve failed", e);
      return;
    }
    const text = cm.state.doc;
    const docText = text.toString();
    const changed = changedLineSet2(text, computeDiff(baseText, docText));
    for (const comment of doc.sidecar.comments) {
      const range = resolveAnchor(docText, comment.anchor);
      if (!range) {
        comment.line = null;
        comment.placement = void 0;
        continue;
      }
      const startLine = text.lineAt(range.from).number;
      const endLine = text.lineAt(Math.max(range.from, range.to - 1)).number;
      comment.line = startLine;
      let inline = false;
      for (let n = startLine; n <= endLine; n++) {
        if (changed.has(n)) {
          inline = true;
          break;
        }
      }
      comment.placement = inline ? "inline" : "fallback";
    }
  }
  async addCommentFromSelection() {
    const view = this.activeMarkdownView();
    if (!view || !view.file) {
      new import_obsidian7.Notice("Open a markdown file first.");
      return;
    }
    const cm = this.cmOf(view);
    if (!cm) {
      new import_obsidian7.Notice(
        "Switch to Live Preview or Source view to add comments (Reading view has no text selection)."
      );
      return;
    }
    if (!this.activeDoc) await this.onActiveFileChanged();
    if (!this.activeDoc) {
      new import_obsidian7.Notice("This file is not inside a git repository.");
      return;
    }
    const sel = cm.state.selection.main;
    if (sel.empty) {
      new import_obsidian7.Notice("Select the text to comment on first.");
      return;
    }
    const docText = cm.state.doc.toString();
    const anchor = captureAnchor(docText, sel.from, sel.to);
    new CommentModal(this.app, {
      quote: anchor.quote,
      onSubmit: async (body) => {
        if (!body || !this.activeDoc) return;
        const comment = {
          id: genId(),
          anchor,
          body,
          status: "open",
          createdAt: (/* @__PURE__ */ new Date()).toISOString()
        };
        this.activeDoc.sidecar.comments.push(comment);
        this.activeDoc.sidecar.pr = this.session?.prNumber;
        this.activeDoc.sidecar.base = this.session?.baseRef ?? this.settings.baseRefFallback;
        await this.saveActiveSidecar();
        await ensureExcluded(
          this.settings.gitPath,
          this.activeDoc.repoRoot,
          this.settings.sidecarDir
        ).catch(() => void 0);
        this.refreshComments();
        void this.refreshPrLocal();
      }
    }).open();
  }
  jumpToComment(id) {
    const view = this.activeMarkdownView();
    const cm = view ? this.cmOf(view) : null;
    const item = this.activeItems.find((i) => i.comment.id === id);
    if (!cm || !item) return;
    if (!item.range) {
      new import_obsidian7.Notice("Anchor not found \u2014 the text may have changed (stale).");
      return;
    }
    cm.dispatch({
      selection: { anchor: item.range.from, head: item.range.to },
      scrollIntoView: true
    });
    cm.focus();
  }
  async toggleResolveComment(id) {
    if (!this.activeDoc) return;
    const comment = this.activeDoc.sidecar.comments.find((c) => c.id === id);
    if (!comment) return;
    comment.status = comment.status === "resolved" ? "open" : "resolved";
    await this.saveActiveSidecar();
    this.refreshComments();
  }
  editComment(id) {
    if (!this.activeDoc) return;
    const comment = this.activeDoc.sidecar.comments.find((c) => c.id === id);
    if (!comment) return;
    new CommentModal(this.app, {
      initial: comment.body,
      quote: comment.anchor.quote,
      onSubmit: async (body) => {
        if (!body) return;
        comment.body = body;
        await this.saveActiveSidecar();
        this.refreshComments();
      }
    }).open();
  }
  async deleteComment(id) {
    if (!this.activeDoc) return;
    const before = this.activeDoc.sidecar.comments.length;
    this.activeDoc.sidecar.comments = this.activeDoc.sidecar.comments.filter(
      (c) => c.id !== id
    );
    if (this.activeDoc.sidecar.comments.length === before) return;
    await this.saveActiveSidecar();
    this.refreshComments();
  }
  /**
   * Post all open, un-posted comments across the current PR as a single batched
   * GitHub review. Anchors are re-resolved against the PR head commit (what the
   * diff is computed from), so inline lines always match — no working-tree
   * mutation. If GitHub rejects an inline comment, retries with everything in
   * the review body.
   */
  async postReviewToGitHub() {
    const s = this.session;
    if (!s) {
      new import_obsidian7.Notice("Open the PR from the queue first, then post the review.");
      return;
    }
    const headSha = await prHeadSha(this.settings.ghPath, s.repoRoot, s.prNumber);
    if (!headSha) {
      new import_obsidian7.Notice("Couldn't resolve the PR head commit.");
      return;
    }
    const target = await repoTarget(this.settings.ghPath, s.repoRoot);
    if (!target) {
      new import_obsidian7.Notice("Couldn't resolve the repository on GitHub.");
      return;
    }
    const relPaths = Array.from(new Set(s.mdFiles));
    const files = [];
    for (const rel of relPaths) {
      const sidecar = await loadSidecar(s.repoRoot, this.settings.sidecarDir, rel);
      if (sidecar.comments.length === 0) continue;
      const resolved = await resolveDocComments(
        this.settings.gitPath,
        s.repoRoot,
        rel,
        s.baseRef,
        headSha,
        sidecar.comments
      );
      files.push({ relPath: rel, resolved, sidecar });
    }
    const pending = files.flatMap((f) => f.resolved).filter((rc) => rc.comment.status === "open" && !rc.comment.postedAt);
    if (pending.length === 0) {
      new import_obsidian7.Notice("No open, un-posted comments to post.");
      return;
    }
    const preview = buildReviewPayload(files, headSha, target.url);
    const choice = await new Promise(
      (resolve) => {
        new ReviewSubmitModal(this.app, {
          prNumber: s.prNumber,
          inlineCount: preview.inlineCount,
          fallbackCount: preview.fallbackCount,
          onSubmit: resolve
        }).open();
      }
    );
    if (!choice) return;
    const built = buildReviewPayload(files, headSha, target.url, {
      event: choice.event,
      summary: choice.summary
    });
    new import_obsidian7.Notice(
      `Posting ${built.inlineCount} inline + ${built.fallbackCount} summary comment(s) to PR #${s.prNumber}\u2026`
    );
    let result;
    try {
      result = await postReview(
        this.settings.ghPath,
        s.repoRoot,
        target.host,
        target.nameWithOwner,
        s.prNumber,
        built.payload
      );
    } catch (e) {
      if (built.inlineCount > 0 && isInlineRejection(e)) {
        const bodyOnly = buildReviewPayload(files, headSha, target.url, {
          allToBody: true,
          event: choice.event,
          summary: choice.summary
        });
        try {
          result = await postReview(
            this.settings.ghPath,
            s.repoRoot,
            target.host,
            target.nameWithOwner,
            s.prNumber,
            bodyOnly.payload
          );
          new import_obsidian7.Notice("Some comments couldn't anchor inline \u2014 posted them in the review summary.");
        } catch (e2) {
          new import_obsidian7.Notice(`Post failed: ${e2.message}`);
          console.error("[markdown-pr-review] postReview retry", e2);
          return;
        }
      } else {
        new import_obsidian7.Notice(`Post failed: ${e.message}`);
        console.error("[markdown-pr-review] postReview", e);
        return;
      }
    }
    const now = (/* @__PURE__ */ new Date()).toISOString();
    for (const f of files) {
      let touched = false;
      for (const rc of f.resolved) {
        if (rc.comment.status === "open" && !rc.comment.postedAt) {
          rc.comment.postedAt = now;
          if (result.html_url) rc.comment.reviewUrl = result.html_url;
          touched = true;
        }
      }
      if (touched) {
        await saveSidecar(s.repoRoot, this.settings.sidecarDir, f.relPath, f.sidecar);
      }
    }
    if (this.activeDoc && relPaths.includes(this.activeDoc.relPath)) {
      this.activeDoc.sidecar = await loadSidecar(
        s.repoRoot,
        this.settings.sidecarDir,
        this.activeDoc.relPath
      );
      this.refreshComments();
    }
    const key = `${s.repoRoot}#${s.prNumber}`;
    this.othersComments.delete(key);
    this.reviewsByPr.delete(key);
    void this.loadOthersComments();
    void this.refreshPrLocal();
    new import_obsidian7.Notice(`Posted review to PR #${s.prNumber}.`);
  }
  /* --------------------------------------------------------------------- */
  /* Persistence                                                            */
  /* --------------------------------------------------------------------- */
  async loadPersisted() {
    const raw = await this.loadData() ?? {};
    const { _session, _reviewed, _repo, ...rest } = raw;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, rest);
    this.session = _session ?? null;
    this.reviewed = new Set(Array.isArray(_reviewed) ? _reviewed : []);
    this.selectedRepo = _repo ?? null;
    this.currentRepoRoot = _repo?.repoRoot ?? null;
  }
  async persist() {
    await this.saveData({
      ...this.settings,
      _session: this.session,
      _reviewed: Array.from(this.reviewed),
      _repo: this.selectedRepo
    });
  }
  async saveSettings() {
    await this.persist();
  }
};
