import {BlobUtil} from './blob.util.js'
import {Uploader} from './uploader.js'
import {Pattern} from "./pattern";

export class Drop {
    private elem: HTMLElement;
    private attrGetter: Function;

    constructor(elem: HTMLElement, attrGetter: Function) {
        this.elem = elem;
        this.attrGetter = attrGetter;

        // if (attrGetter('ngfSelect') == null) {
        //   upload.registerModelChangeValidator(ngModel, attr, scope);
        // }

        var leaveTimeout = null;
        var dragOverDelay = 1;
        var actualDragOverClass;

        elem.addEventListener('dragover', (evt) => {
            if (this.isDisabled() || attrGetter('dropDisabled')) return;
            evt.preventDefault();
            if (this.attrGetter('stopPropagation')) evt.stopPropagation();
            // handling dragover events from the Chrome download bar
            if (navigator.userAgent.indexOf('Chrome') > -1) {
                var b = evt.dataTransfer.effectAllowed;
                evt.dataTransfer.dropEffect = ('move' === b || 'linkMove' === b) ? 'move' : 'copy';
            }
            clearTimeout(leaveTimeout);
            if (!actualDragOverClass) {
                actualDragOverClass  = this.calculateDragOverClass(evt,
                    this.attrGetter('ngfDragOverClass', {$event: evt}));
                Drop.addClass(elem, actualDragOverClass);
            }
        }, false);
        elem.addEventListener('dragenter', (evt) => {
            if (this.isDisabled() || attrGetter('dropDisabled')) return;
            evt.preventDefault();
            if (this.attrGetter('stopPropagation')) evt.stopPropagation();
        }, false);
        elem.addEventListener('dragleave',  (evt) => {
            if (this.isDisabled() || attrGetter('dropDisabled')) return;
            evt.preventDefault();
            if (this.attrGetter('stopPropagation')) evt.stopPropagation();
            leaveTimeout = function () {
                if (actualDragOverClass) Drop.removeClass(elem, actualDragOverClass);
                actualDragOverClass = null;
            };
            setTimeout(leaveTimeout, dragOverDelay || 100);
        }, false);
        elem.addEventListener('drop',  (evt)  =>{
            if (this.isDisabled() || attrGetter('dropDisabled')) return;
            evt.preventDefault();
            if (attrGetter('stopPropagation')) evt.stopPropagation();
            if (actualDragOverClass) Drop.removeClass(elem, actualDragOverClass);
            actualDragOverClass = null;
            var items = evt.dataTransfer.items;
            var html;
            try {
                html = evt.dataTransfer && evt.dataTransfer.getData && evt.dataTransfer.getData('text/html');
            } catch (e) {/* Fix IE11 that throw error calling getData */
            }

            this.extractFiles(items, evt.dataTransfer.files, attrGetter('allowDir') !== false,
                attrGetter('multiple')).then((files:Array<any>) => {
                if (files.length) {
                    elem.dispatchEvent(new CustomEvent('fileDrop', {detail: {files: files, origEvent: evt}}))
                } else {
                    this.extractFilesFromHtml('dropUrl', html).then((files) => {
                        elem.dispatchEvent(new CustomEvent('fileDrop', {detail: {files: files, origEvent: evt}}))
                    });
                }
            });
        }, false);
        elem.addEventListener('paste',  (evt:any) => {
            if (navigator.userAgent.toLowerCase().indexOf('firefox') > -1 &&
                attrGetter('enableFirefoxPaste')) {
                evt.preventDefault();
            }
            if (this.isDisabled() || attrGetter('pasteDisabled')) return;
            var files = [];
            var clipboard = evt.clipboardData || evt.originalEvent.clipboardData;
            if (clipboard && clipboard.items) {
                for (var k = 0; k < clipboard.items.length; k++) {
                    if (clipboard.items[k].type.indexOf('image') !== -1) {
                        files.push(clipboard.items[k].getAsFile());
                    }
                }
            }
            if (files.length) {
                elem.dispatchEvent(new CustomEvent('fileDrop', {detail: {files: files, origEvent: evt}}))
            } else {
                this.extractFilesFromHtml('pasteUrl', clipboard).then((files) => {
                    elem.dispatchEvent(new CustomEvent('fileDrop', {detail: {files: files, origEvent: evt}}))
                });
            }
        }, false);

        if (navigator.userAgent.toLowerCase().indexOf('firefox') > -1 &&
            attrGetter('enableFirefoxPaste')) {
            elem.setAttribute('contenteditable', 'true');
            elem.addEventListener('keypress', function (e) {
                if (!e.metaKey && !e.ctrlKey) {
                    e.preventDefault();
                }
            });
        }
    }

    extractFilesFromHtml = (updateOn, html) => {
        if (this.attrGetter(updateOn + 'Disabled') || typeof html !== 'string') {
            return new Promise((resolve, reject) => {
                reject([])
            });
        }
        var urls = [];
        html.replace(/<(img src|img [^>]* src) *=\"([^\"]*)\"/gi, (m, n, src:string) => {
            urls.push(src);
            return src;
        });
        var promises = [], files = [];
        for (var i = 0; i < urls.length; i++) {
            var url = urls[i];
            promises.push(BlobUtil.urlToBlob(url).then(function (blob) {
                files.push(blob);
            }));
        }
        return new Promise((resolve) => {
            if (!promises.length) resolve(files);
            Promise.all(promises).then(() => {
                resolve(files);
            }).catch(() => {
                resolve(files);
            });
        });
    };

    calculateDragOverClass(evt, obj) {
        var dClass = 'dragover';
        if (typeof obj === 'string') {
            dClass = obj;
        } else if (obj) {
            if (obj.accept || obj.reject) {
                var items = evt.dataTransfer.items;
                if (items == null || !items.length) {
                    dClass = obj.accept;
                } else {
                    var pattern = obj.pattern || this.attrGetter('ngfPattern', {$event: evt});
                    var len = items.length;
                    while (len--) {
                        if (!Pattern.validatePattern(items[len], pattern)) {
                            dClass = obj.reject;
                            break;
                        } else {
                            dClass = obj.accept;
                        }
                    }
                }
            }
        }
        return dClass;
    }

    extractFiles(items, fileList, allowDir, multiple) {
        var maxFiles = this.attrGetter('maxFiles');
        if (maxFiles == null) {
            maxFiles = Number.MAX_VALUE;
        }
        var maxTotalSize = this.attrGetter('maxTotalSize');
        if (maxTotalSize == null) {
            maxTotalSize = Number.MAX_VALUE;
        }
        var includeDir = this.attrGetter('ngfIncludeDir');
        var files = [], totalSize = 0;

        function traverseFileTree(entry, path) {
            return new Promise((resolve, reject) => {
                if (entry != null) {
                    if (entry.isDirectory) {
                        var promises = [];
                        if (includeDir) {
                            var file:any = {type: 'directory'};
                            file.name = file.path = (path || '') + entry.name;
                            files.push(file);
                        }
                        var dirReader = entry.createReader();
                        var entries = [];
                        var readEntries = function () {
                            dirReader.readEntries(function (results) {
                                try {
                                    if (!results.length) {
                                        var allEntries = entries.slice(0);
                                        for (var i = 0; i < allEntries.length; i++) {
                                            var e = allEntries[i];
                                            if (files.length <= maxFiles && totalSize <= maxTotalSize) {
                                                promises.push(traverseFileTree(e, (path ? path : '') + entry.name + '/'));
                                            }
                                        }
                                        if (!promises.length) resolve();
                                        Promise.all(promises).then(() => {
                                            resolve();
                                        }, function (e) {
                                            reject(e);
                                        });
                                    } else {
                                        entries = entries.concat(Array.prototype.slice.call(results || [], 0));
                                        readEntries();
                                    }
                                } catch (e) {
                                    reject(e);
                                }
                            }, function (e) {
                                reject(e);
                            });
                        };
                        readEntries();
                    } else {
                        entry.file(function (file) {
                            try {
                                file.path = (path ? path : '') + file.name;
                                if (includeDir) {
                                    file = Uploader.rename(file, file.path);
                                }
                                files.push(file);
                                totalSize += file.size;
                                resolve();
                            } catch (e) {
                                reject(e);
                            }
                        }, function (e) {
                            reject(e);
                        });
                    }
                }
            });
        }

        var promises = [new Promise((resolve) => {resolve();})];

        if (items && items.length > 0 && window.location.protocol !== 'file:') {
            for (var i = 0; i < items.length; i++) {
                if (items[i].webkitGetAsEntry && items[i].webkitGetAsEntry() && items[i].webkitGetAsEntry().isDirectory) {
                    var entry = items[i].webkitGetAsEntry();
                    if (entry.isDirectory && !allowDir) {
                        continue;
                    }
                    if (entry != null) {
                        promises.push(traverseFileTree(entry, undefined));
                    }
                } else {
                    var f = items[i].getAsFile();
                    if (f != null) {
                        files.push(f);
                        totalSize += f.size;
                    }
                }
                if (files.length > maxFiles || totalSize > maxTotalSize ||
                    (!multiple && files.length > 0)) break;
            }
        } else {
            if (fileList != null) {
                for (var j = 0; j < fileList.length; j++) {
                    var file = fileList.item(j);
                    if (file.type || file.size > 0) {
                        files.push(file);
                        totalSize += file.size;
                    }
                    if (files.length > maxFiles || totalSize > maxTotalSize ||
                        (!multiple && files.length > 0)) break;
                }
            }
        }

        return new Promise((resolve, reject) => {
            Promise.all(promises).then(() => {
                if (!multiple && !includeDir && files.length) {
                    var i = 0;
                    while (files[i] && files[i].type === 'directory') i++;
                    resolve([files[i]]);
                } else {
                    resolve(files);
                }
            }).catch((e) => {
                reject(e);
            });
        });
    }

    isDisabled = () => {
        return this.elem.getAttribute('disabled') || this.attrGetter('ngfDropDisabled');
    };

    public static dropAvailable() {
        var div = document.createElement('div');
        return ('draggable' in div) && ('ondrop' in div) && !/Edge\/12./i.test(navigator.userAgent);
    }

    static addClass(elem, c) {
        if (!elem.className.match(new RegExp('(\\s|^)' + c + '(\\s|$)'))) {
            elem.className += ' ' + c;
        }
    }

    static removeClass(elem, c) {
        var regexp = new RegExp('(\\s|^)' + c + '(\\s|$)');
        if (elem.className.match(regexp)) {
            elem.className += elem.className.replace(regexp, ' ');
        }
    }
}