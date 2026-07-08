(function (root) {
  "use strict";

  var STORAGE_KEY = "light-notes:v1";
  var THEME_KEY = "light-notes:theme";
  var DEFAULT_TITLE = "无标题笔记";
  var EMPTY_PREVIEW = "空白笔记";

  function now() {
    return new Date().toISOString();
  }

  function makeId() {
    if (root.crypto && typeof root.crypto.randomUUID === "function") {
      return root.crypto.randomUUID();
    }
    return "note-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }

  function createNote(title, content) {
    var timestamp = now();
    return {
      id: makeId(),
      title: title || DEFAULT_TITLE,
      content: content || "",
      createdAt: timestamp,
      updatedAt: timestamp
    };
  }

  function normalizeNotes(value) {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .filter(function (note) {
        return note && typeof note.id === "string";
      })
      .map(function (note) {
        var updatedAt = note.updatedAt || note.createdAt || now();
        return {
          id: note.id,
          title: String(note.title || DEFAULT_TITLE),
          content: String(note.content || ""),
          createdAt: note.createdAt || updatedAt,
          updatedAt: updatedAt
        };
      });
  }

  function sortNotes(notes) {
    return normalizeNotes(notes).slice().sort(function (a, b) {
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }

  function filterNotes(notes, keyword) {
    var query = String(keyword || "").trim().toLowerCase();
    if (!query) {
      return sortNotes(notes);
    }
    return sortNotes(notes).filter(function (note) {
      return (note.title + "\n" + note.content).toLowerCase().indexOf(query) !== -1;
    });
  }

  function deriveTitle(content) {
    var firstLine = String(content || "").split(/\r?\n/).map(function (line) {
      return line.trim();
    }).filter(Boolean)[0];
    return firstLine ? firstLine.slice(0, 80) : DEFAULT_TITLE;
  }

  function saveNotes(storage, notes) {
    storage.setItem(STORAGE_KEY, JSON.stringify(normalizeNotes(notes)));
  }

  function loadNotes(storage) {
    try {
      return normalizeNotes(JSON.parse(storage.getItem(STORAGE_KEY) || "[]"));
    } catch (error) {
      return [];
    }
  }

  function normalizeTheme(value) {
    return value === "dark" ? "dark" : "light";
  }

  function loadTheme(storage) {
    try {
      return normalizeTheme(storage.getItem(THEME_KEY));
    } catch (error) {
      return "light";
    }
  }

  function saveTheme(storage, theme) {
    try {
      storage.setItem(THEME_KEY, normalizeTheme(theme));
    } catch (error) {
      return;
    }
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function safeHref(value) {
    var href = String(value || "").trim();
    if (/^(https?:|mailto:|#)/i.test(href)) {
      return escapeHtml(href);
    }
    return "#";
  }

  function highlightInlineMarkdown(text) {
    return escapeHtml(text)
      .replace(/(`[^`\n]+`)/g, '<span class="md-code">$1</span>')
      .replace(/(\*\*[^*\n]+\*\*)/g, '<span class="md-strong">$1</span>')
      .replace(/(\*[^*\n]+\*)/g, '<span class="md-em">$1</span>')
      .replace(/(\[[^\]\n]+\]\([^)]+\))/g, '<span class="md-link">$1</span>');
  }

  function highlightMarkdown(markdown) {
    return String(markdown || "").split(/\n/).map(function (line) {
      if (/^\s*#{1,6}\s+/.test(line)) {
        return '<span class="md-heading">' + highlightInlineMarkdown(line) + "</span>";
      }
      if (/^\s*>\s?/.test(line)) {
        return '<span class="md-quote">' + highlightInlineMarkdown(line) + "</span>";
      }
      if (/^\s*(-|\*|\+|\d+\.)\s+/.test(line)) {
        return '<span class="md-list">' + highlightInlineMarkdown(line) + "</span>";
      }
      return highlightInlineMarkdown(line);
    }).join("\n");
  }

  function renderInlineMarkdown(text) {
    return escapeHtml(text)
      .replace(/`([^`\n]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*\n]+)\*/g, "<em>$1</em>")
      .replace(/\[([^\]\n]+)\]\(([^)]+)\)/g, function (_match, label, href) {
        return '<a href="' + safeHref(href) + '" target="_blank" rel="noopener noreferrer">' + label + "</a>";
      });
  }

  function renderMarkdown(markdown) {
    var lines = String(markdown || "").split(/\r?\n/);
    var html = [];
    var paragraph = [];
    var listType = null;
    var listItems = [];
    var inCode = false;
    var codeLines = [];

    function flushParagraph() {
      if (paragraph.length) {
        html.push("<p>" + renderInlineMarkdown(paragraph.join(" ")) + "</p>");
        paragraph = [];
      }
    }

    function flushList() {
      if (listType) {
        html.push("<" + listType + ">" + listItems.join("") + "</" + listType + ">");
        listType = null;
        listItems = [];
      }
    }

    lines.forEach(function (line) {
      var heading = /^(#{1,6})\s+(.+)$/.exec(line);
      var unordered = /^\s*[-*+]\s+(.+)$/.exec(line);
      var ordered = /^\s*\d+\.\s+(.+)$/.exec(line);
      if (/^```/.test(line)) {
        if (inCode) {
          html.push("<pre><code>" + escapeHtml(codeLines.join("\n")) + "</code></pre>");
          codeLines = [];
          inCode = false;
        } else {
          flushParagraph();
          flushList();
          inCode = true;
        }
        return;
      }
      if (inCode) {
        codeLines.push(line);
        return;
      }
      if (!line.trim()) {
        flushParagraph();
        flushList();
        return;
      }
      if (heading) {
        flushParagraph();
        flushList();
        html.push("<h" + heading[1].length + ">" + renderInlineMarkdown(heading[2]) + "</h" + heading[1].length + ">");
        return;
      }
      if (/^>\s?/.test(line)) {
        flushParagraph();
        flushList();
        html.push("<blockquote>" + renderInlineMarkdown(line.replace(/^>\s?/, "")) + "</blockquote>");
        return;
      }
      if (unordered || ordered) {
        flushParagraph();
        if (!listType) {
          listType = unordered ? "ul" : "ol";
        }
        if ((unordered && listType !== "ul") || (ordered && listType !== "ol")) {
          flushList();
          listType = unordered ? "ul" : "ol";
        }
        listItems.push("<li>" + renderInlineMarkdown((unordered || ordered)[1]) + "</li>");
        return;
      }
      paragraph.push(line.trim());
    });

    if (inCode) {
      html.push("<pre><code>" + escapeHtml(codeLines.join("\n")) + "</code></pre>");
    }
    flushParagraph();
    flushList();
    return html.join("");
  }

  function createLocalStore(storage) {
    return {
      remote: false,
      load: function () {
        return Promise.resolve(loadNotes(storage));
      },
      save: function (notes) {
        saveNotes(storage, notes);
        return Promise.resolve(normalizeNotes(notes));
      }
    };
  }

  function createRemoteStore(endpoint, fallbackStore) {
    return {
      remote: true,
      load: function () {
        return root.fetch(endpoint, { cache: "no-store" })
          .then(function (response) {
            if (!response.ok) {
              throw new Error("读取同步数据失败");
            }
            return response.json();
          })
          .then(normalizeNotes)
          .catch(function () {
            return fallbackStore.load();
          });
      },
      save: function (notes) {
        return root.fetch(endpoint, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(normalizeNotes(notes))
        }).then(function (response) {
          if (!response.ok) {
            throw new Error("提交同步数据失败");
          }
          return response.json();
        }).then(normalizeNotes);
      }
    };
  }

  function createDefaultStore() {
    var localStore = createLocalStore(root.localStorage);
    if (root.location && /^https?:$/.test(root.location.protocol) && typeof root.fetch === "function") {
      return createRemoteStore("/api/notes", localStore);
    }
    return localStore;
  }

  function formatTime(isoText) {
    var date = new Date(isoText);
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    return date.toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function NoteApp(options) {
    this.store = options.store || createLocalStore(options.storage);
    this.themeStorage = options.themeStorage || options.storage || root.localStorage;
    this.nodes = options.nodes;
    this.notes = [];
    this.selectedId = null;
    this.searchTerm = "";
    this.theme = loadTheme(this.themeStorage);
    this.editorMode = "edit";
    this.saveTimer = null;
    this.syncTimer = null;
    this.isEditing = false;
    this.bindEvents();
    this.applyTheme();
    this.render();
    this.ready = this.loadInitialNotes();
    this.startSync();
  }

  NoteApp.prototype.loadInitialNotes = function () {
    var app = this;
    this.nodes.saveStatus.textContent = this.store.remote ? "同步中..." : "已提交";
    return this.store.load().then(function (notes) {
      app.notes = sortNotes(notes);
      app.selectedId = app.notes[0] ? app.notes[0].id : null;
      app.nodes.saveStatus.textContent = app.store.remote ? "已同步" : "已提交";
      app.render();
      return app.notes;
    });
  };

  NoteApp.prototype.startSync = function () {
    var app = this;
    if (!this.store.remote) {
      return;
    }
    this.syncTimer = setInterval(function () {
      app.refreshFromStore();
    }, 2500);
  };

  NoteApp.prototype.refreshFromStore = function () {
    var app = this;
    if (this.isEditing) {
      return Promise.resolve(this.notes);
    }
    return this.store.load().then(function (notes) {
      var selectedId = app.selectedId;
      app.notes = sortNotes(notes);
      app.selectedId = app.notes.some(function (note) {
        return note.id === selectedId;
      }) ? selectedId : (app.notes[0] ? app.notes[0].id : null);
      app.render();
      return app.notes;
    });
  };

  NoteApp.prototype.bindEvents = function () {
    var app = this;
    this.nodes.newNote.addEventListener("click", function () {
      app.addNote();
    });
    this.nodes.emptyNewNote.addEventListener("click", function () {
      app.addNote();
    });
    this.nodes.searchInput.addEventListener("input", function (event) {
      app.searchTerm = event.target.value;
      app.renderList();
    });
    this.nodes.titleInput.addEventListener("focus", function () {
      app.isEditing = true;
    });
    this.nodes.titleInput.addEventListener("blur", function () {
      app.isEditing = false;
    });
    this.nodes.contentInput.addEventListener("focus", function () {
      app.isEditing = true;
    });
    this.nodes.contentInput.addEventListener("blur", function () {
      app.isEditing = false;
    });
    this.nodes.titleInput.addEventListener("input", function (event) {
      app.updateSelected({ title: event.target.value || DEFAULT_TITLE });
    });
    this.nodes.contentInput.addEventListener("input", function (event) {
      var current = app.getSelected();
      var patch = { content: event.target.value };
      if (current && current.title === DEFAULT_TITLE) {
        patch.title = deriveTitle(event.target.value);
      }
      app.updateSelected(patch);
    });
    this.nodes.submitNote.addEventListener("click", function () {
      return app.persistNow();
    });
    this.nodes.deleteNote.addEventListener("click", function () {
      app.deleteSelected();
    });
    if (this.nodes.themeToggle) {
      this.nodes.themeToggle.addEventListener("change", function (event) {
        app.setTheme(event.target.checked ? "dark" : "light");
      });
    }
    if (this.nodes.editMode) {
      this.nodes.editMode.addEventListener("click", function () {
        app.setEditorMode("edit");
      });
    }
    if (this.nodes.previewMode) {
      this.nodes.previewMode.addEventListener("click", function () {
        app.setEditorMode("preview");
      });
    }
    if (this.nodes.contentInput && this.nodes.markdownHighlight) {
      this.nodes.contentInput.addEventListener("scroll", function () {
        app.nodes.markdownHighlight.scrollTop = app.nodes.contentInput.scrollTop;
        app.nodes.markdownHighlight.scrollLeft = app.nodes.contentInput.scrollLeft;
      });
    }
  };

  NoteApp.prototype.setEditorMode = function (mode) {
    this.editorMode = mode === "preview" ? "preview" : "edit";
    this.renderMarkdownViews();
  };

  NoteApp.prototype.renderMarkdownViews = function () {
    var selected = this.getSelected();
    var content = selected ? selected.content : "";
    var isPreview = this.editorMode === "preview";
    if (this.nodes.markdownHighlight) {
      this.nodes.markdownHighlight.innerHTML = highlightMarkdown(content) + "\n";
    }
    if (this.nodes.markdownPreview) {
      this.nodes.markdownPreview.innerHTML = renderMarkdown(content);
      this.nodes.markdownPreview.hidden = !isPreview;
    }
    if (this.nodes.markdownEditor) {
      this.nodes.markdownEditor.hidden = isPreview;
    }
    if (this.nodes.editMode) {
      this.nodes.editMode.className = "mode-button" + (!isPreview ? " active" : "");
    }
    if (this.nodes.previewMode) {
      this.nodes.previewMode.className = "mode-button" + (isPreview ? " active" : "");
    }
  };

  NoteApp.prototype.applyTheme = function () {
    var label = this.theme === "dark" ? "深色模式" : "浅色模式";
    if (root.document && root.document.body) {
      root.document.body.setAttribute("data-theme", this.theme);
    }
    if (this.nodes.themeToggle) {
      this.nodes.themeToggle.checked = this.theme === "dark";
    }
    if (this.nodes.themeLabel) {
      this.nodes.themeLabel.textContent = label;
    }
  };

  NoteApp.prototype.setTheme = function (theme) {
    this.theme = normalizeTheme(theme);
    saveTheme(this.themeStorage, this.theme);
    this.applyTheme();
  };

  NoteApp.prototype.getSelected = function () {
    var id = this.selectedId;
    return this.notes.find(function (note) {
      return note.id === id;
    }) || null;
  };

  NoteApp.prototype.persistSoon = function () {
    var app = this;
    this.nodes.saveStatus.textContent = this.store.remote ? "同步中..." : "保存中...";
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(function () {
      app.persistNow();
    }, 180);
  };

  NoteApp.prototype.persistNow = function () {
    var app = this;
    clearTimeout(this.saveTimer);
    this.nodes.saveStatus.textContent = this.store.remote ? "同步中..." : "提交中...";
    return this.store.save(this.notes).then(function (notes) {
      app.notes = sortNotes(notes);
      app.nodes.saveStatus.textContent = app.store.remote ? "已同步" : "已提交";
      app.renderList();
      return app.notes;
    }).catch(function () {
      app.nodes.saveStatus.textContent = "同步失败，请检查服务";
      return app.notes;
    });
  };

  NoteApp.prototype.addNote = function () {
    var note = createNote(DEFAULT_TITLE, "");
    this.notes.unshift(note);
    this.selectedId = note.id;
    this.persistSoon();
    this.render();
    this.nodes.titleInput.focus();
  };

  NoteApp.prototype.updateSelected = function (patch) {
    var changed = false;
    var timestamp = now();
    this.notes = this.notes.map(function (note) {
      if (note.id !== this.selectedId) {
        return note;
      }
      changed = true;
      return Object.assign({}, note, patch, { updatedAt: timestamp });
    }, this);
    if (changed) {
      this.persistSoon();
      this.renderList();
      this.renderEditor();
    }
  };

  NoteApp.prototype.deleteSelected = function () {
    if (!this.selectedId) {
      return;
    }
    this.deleteNoteById(this.selectedId);
  };

  NoteApp.prototype.deleteNoteById = function (id) {
    var selectedIndex = this.notes.findIndex(function (note) {
      return note.id === id;
    });
    if (selectedIndex === -1) {
      return;
    }
    this.notes = this.notes.filter(function (note) {
      return note.id !== id;
    });
    if (this.selectedId === id) {
      var nextNote = this.notes[Math.max(0, selectedIndex - 1)] || this.notes[0] || null;
      this.selectedId = nextNote ? nextNote.id : null;
    }
    this.persistSoon();
    this.render();
  };

  NoteApp.prototype.render = function () {
    this.renderList();
    this.renderEditor();
  };

  NoteApp.prototype.renderList = function () {
    var app = this;
    var visibleNotes = filterNotes(this.notes, this.searchTerm);
    this.nodes.noteCount.textContent = this.notes.length + " 条笔记";
    this.nodes.notesList.innerHTML = "";

    if (!visibleNotes.length) {
      var blank = document.createElement("p");
      blank.className = "note-preview";
      blank.textContent = this.searchTerm ? "没有匹配的笔记" : "还没有笔记";
      this.nodes.notesList.appendChild(blank);
      return;
    }

    visibleNotes.forEach(function (note) {
      var item = document.createElement("div");
      var button = document.createElement("button");
      var deleteButton = document.createElement("button");
      var title = document.createElement("span");
      var preview = document.createElement("span");

      item.className = "note-item" + (note.id === app.selectedId ? " active" : "");
      button.type = "button";
      button.className = "note-select";
      button.addEventListener("click", function () {
        app.selectedId = note.id;
        app.render();
      });

      deleteButton.type = "button";
      deleteButton.className = "note-delete";
      deleteButton.textContent = "×";
      deleteButton.title = "删除笔记";
      deleteButton.setAttribute("aria-label", "删除笔记");
      deleteButton.addEventListener("click", function (event) {
        event.stopPropagation();
        app.deleteNoteById(note.id);
      });

      title.className = "note-title";
      title.textContent = note.title || DEFAULT_TITLE;
      preview.className = "note-preview";
      preview.textContent = note.content || EMPTY_PREVIEW;

      button.appendChild(title);
      button.appendChild(preview);
      item.appendChild(button);
      item.appendChild(deleteButton);
      app.nodes.notesList.appendChild(item);
    });
  };

  NoteApp.prototype.renderEditor = function () {
    var selected = this.getSelected();
    this.nodes.emptyState.hidden = Boolean(selected);
    this.nodes.editor.hidden = !selected;
    if (!selected) {
      return;
    }

    if (this.nodes.titleInput.value !== selected.title) {
      this.nodes.titleInput.value = selected.title;
    }
    if (this.nodes.contentInput.value !== selected.content) {
      this.nodes.contentInput.value = selected.content;
    }
    this.renderMarkdownViews();
    this.nodes.updatedAt.textContent = "更新于 " + formatTime(selected.updatedAt);
  };

  function startBrowserApp() {
    if (!root.document) {
      return null;
    }
    var nodes = {
      newNote: document.getElementById("new-note"),
      emptyNewNote: document.getElementById("empty-new-note"),
      submitNote: document.getElementById("submit-note"),
      deleteNote: document.getElementById("delete-note"),
      searchInput: document.getElementById("search-input"),
      notesList: document.getElementById("notes-list"),
      noteCount: document.getElementById("note-count"),
      emptyState: document.getElementById("empty-state"),
      editor: document.getElementById("editor"),
      titleInput: document.getElementById("title-input"),
      contentInput: document.getElementById("content-input"),
      saveStatus: document.getElementById("save-status"),
      updatedAt: document.getElementById("updated-at"),
      themeToggle: document.getElementById("theme-toggle"),
      themeLabel: document.getElementById("theme-label"),
      editMode: document.getElementById("edit-mode"),
      previewMode: document.getElementById("preview-mode"),
      markdownEditor: document.getElementById("markdown-editor"),
      markdownHighlight: document.getElementById("markdown-highlight"),
      markdownPreview: document.getElementById("markdown-preview")
    };
    return new NoteApp({
      store: createDefaultStore(),
      nodes: nodes
    });
  }

  var NotesCore = {
    STORAGE_KEY: STORAGE_KEY,
    THEME_KEY: THEME_KEY,
    DEFAULT_TITLE: DEFAULT_TITLE,
    createNote: createNote,
    normalizeNotes: normalizeNotes,
    sortNotes: sortNotes,
    filterNotes: filterNotes,
    deriveTitle: deriveTitle,
    saveNotes: saveNotes,
    loadNotes: loadNotes,
    normalizeTheme: normalizeTheme,
    loadTheme: loadTheme,
    saveTheme: saveTheme,
    escapeHtml: escapeHtml,
    highlightMarkdown: highlightMarkdown,
    renderMarkdown: renderMarkdown,
    createLocalStore: createLocalStore,
    createRemoteStore: createRemoteStore,
    NoteApp: NoteApp
  };

  root.NotesCore = NotesCore;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = NotesCore;
  }

  if (root.document) {
    document.addEventListener("DOMContentLoaded", startBrowserApp);
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
