// db.js - Database operations using IndexedDB (browser-native storage)

// Verse count data for accurate end-of-chapter calculations
const verseCountData = {
  "Gen": [31,25,24,26,32,22,24,22,29,32,32,20,18,24,21,16,27,33,38,18,34,24,20,67,34,35,46,22,35,43,55,32,20,31,29,43,36,30,23,23,57,38,34,34,28,34,31,22,33,26],
  "Exod": [22,25,22,31,23,30,25,32,35,29,10,51,22,31,27,36,16,27,25,26,36,31,33,18,40,37,21,43,46,38,18,35,23,35,35,38,29,31,43,38],
  "Lev": [17,16,17,35,19,30,38,36,24,20,47,8,59,57,33,34,16,30,37,27,24,33,44,23,55,46,34],
  "Num": [54,34,51,49,31,27,89,26,23,36,35,16,33,45,41,50,13,32,22,29,35,41,30,25,18,65,23,31,40,16,54,42,56,29,34,13],
  "Deut": [46,37,29,49,33,25,26,20,29,22,32,32,18,29,23,22,20,22,21,20,23,30,25,22,19,19,26,68,29,20,30,52,29,12],
  "Josh": [18,24,17,24,15,27,26,35,27,43,23,24,33,15,63,10,18,28,51,9,45,34,16,33],
  "Judg": [36,23,31,24,31,40,25,35,57,18,40,15,25,20,20,31,13,31,30,48,25],
  "Ruth": [22,23,18,22],
  "1Sam": [28,36,21,22,12,21,17,22,27,27,15,25,23,52,35,23,58,30,24,42,15,23,29,22,44,25,12,25,11,31,13],
  "2Sam": [27,32,39,12,25,23,29,18,13,19,27,31,39,33,37,23,29,33,43,26,22,51,39,25],
  "1Kgs": [53,46,28,34,18,38,51,66,28,29,43,33,34,31,34,34,24,46,21,43,29,53],
  "2Kgs": [18,25,27,44,27,33,20,29,37,36,21,21,25,29,38,20,41,37,37,21,26,20,37,20,30],
  "1Chr": [54,55,24,43,26,81,40,40,44,14,47,40,14,17,29,43,27,17,19,8,30,19,32,31,31,32,34,21,30],
  "2Chr": [17,18,17,22,14,42,22,18,31,19,23,16,22,15,19,14,19,34,11,37,20,12,21,27,28,23,9,27,36,27,21,33,25,33,27,23],
  "Ezra": [11,70,13,24,17,22,28,36,15,44],
  "Neh": [11,20,32,23,19,19,73,18,38,39,36,47,31],
  "Esth": [22,23,15,17,14,14,10,17,32,3],
  "Job": [22,13,26,21,27,30,21,22,35,22,20,25,28,22,35,22,16,21,29,29,34,30,17,25,6,14,23,28,25,31,40,22,33,37,16,33,24,41,30,24,34,17],
  "Ps": [6,12,8,8,12,10,17,9,20,18,7,8,6,7,5,11,15,50,14,9,13,31,6,10,22,12,14,9,11,12,24,11,22,22,28,12,40,22,13,17,13,11,5,26,17,11,9,14,20,23,19,9,6,7,23,13,11,11,17,12,8,12,11,10,13,20,7,35,36,5,24,20,28,23,10,12,20,72,13,19,16,8,18,12,13,17,7,18,52,17,16,15,5,23,11,13,12,9,9,5,8,28,22,35,45,48,43,13,31,7,10,10,9,8,18,19,2,29,176,7,8,9,4,8,5,6,5,6,8,8,3,18,3,3,21,26,9,8,24,13,10,7,12,15,21,10,20,14,9,6],
  "Prov": [33,22,35,27,23,35,27,36,18,32,31,28,25,35,33,33,28,24,29,30,31,29,35,34,28,28,27,28,27,33,31],
  "Eccl": [18,26,22,16,20,12,29,17,18,20,10,14],
  "Song": [17,17,11,16,16,13,13,14],
  "Isa": [31,22,26,6,30,13,25,22,21,34,16,6,22,32,9,14,14,7,25,6,17,25,18,23,12,21,13,29,24,33,9,20,24,17,10,22,38,22,8,31,29,25,28,28,25,13,15,22,26,11,23,15,12,17,13,12,21,14,21,22,11,12,19,12,25,24],
  "Jer": [19,37,25,31,31,30,34,22,26,25,23,17,27,22,21,21,27,23,15,18,14,30,40,10,38,24,22,17,32,24,40,44,26,22,19,32,21,28,18,16,18,22,13,30,5,28,7,47,39,46,64,34],
  "Lam": [22,22,66,22,22],
  "Ezek": [28,10,27,17,17,14,27,18,11,22,25,28,23,23,8,63,24,32,14,49,32,31,49,27,17,21,36,26,21,26,18,32,33,31,15,38,28,23,29,49,26,20,27,31,25,24,23,35],
  "Dan": [21,49,30,37,31,28,28,27,27,21,45,13],
  "Hos": [11,23,5,19,15,11,16,14,17,15,12,14,16,9],
  "Joel": [20,32,21],
  "Amos": [15,16,15,13,27,14,17,14,15],
  "Obad": [21],
  "Jonah": [17,10,10,11],
  "Mic": [16,13,12,13,15,16,20],
  "Nah": [15,13,19],
  "Hab": [17,20,19],
  "Zeph": [18,15,20],
  "Hag": [15,23],
  "Zech": [21,13,10,14,11,15,14,23,17,12,17,14,9,21],
  "Mal": [14,17,18,6],
  "Matt": [25,23,17,25,48,34,29,34,38,42,30,50,58,36,39,28,27,35,30,34,46,46,39,51,46,75,66,20],
  "Mark": [45,28,35,41,43,56,37,38,50,52,33,44,37,72,47,20],
  "Luke": [80,52,38,44,39,49,50,56,62,42,54,59,35,35,32,31,37,43,48,47,38,71,56,53],
  "John": [51,25,36,54,47,71,53,59,41,42,57,50,38,31,27,33,26,40,42,31,25],
  "Acts": [26,47,26,37,42,15,60,40,43,48,30,25,52,28,41,40,34,28,41,38,40,30,35,27,27,32,44,31],
  "Rom": [32,29,31,25,21,23,25,39,33,21,36,21,14,23,33,27],
  "1Cor": [31,16,23,21,13,20,40,13,27,33,34,31,13,40,58,24],
  "2Cor": [24,17,18,18,21,18,16,24,15,18,33,21,14],
  "Gal": [24,21,29,31,26,18],
  "Eph": [23,22,21,32,33,24],
  "Phil": [30,30,21,23],
  "Col": [29,23,25,18],
  "1Thess": [10,20,13,18,28],
  "2Thess": [12,17,18],
  "1Tim": [20,15,16,16,25,21],
  "2Tim": [18,26,17,22],
  "Titus": [16,15,15],
  "Phlm": [25],
  "Heb": [14,18,19,16,14,20,28,13,28,39,40,29,25],
  "Jas": [27,26,18,17,20],
  "1Pet": [25,25,22,19,14],
  "2Pet": [21,22,18],
  "1John": [10,29,24,21,21],
  "2John": [13],
  "3John": [14],
  "Jude": [25],
  "Rev": [20,29,22,11,14,17,17,13,21,11,19,17,18,20,8,21,18,24,21,15,27,21]
};

// Get the last verse number for a specific chapter
function getLastVerse(book, chapter) {
  if (!verseCountData[book]) return 999;
  const chapterIndex = chapter - 1;
  if (chapterIndex < 0 || chapterIndex >= verseCountData[book].length) return 999;
  return verseCountData[book][chapterIndex];
}

// Get the previous verse reference
function getPreviousVerse(reference) {
  const parts = reference.split('.');
  const book = parts[0];
  let chapter = parseInt(parts[1]);
  const verseRaw = parts[2] || '1';
  const midVerse = verseRaw.endsWith('b');
  let verse = parseInt(verseRaw);

  // If midverse, "previous" is the start (a-part) of the same verse
  if (midVerse) {
    return `${book}.${chapter}.${verse}`;
  }

  // If not first verse, just go back one verse
  if (verse > 1) {
    return `${book}.${chapter}.${verse - 1}`;
  }

  // If first verse of chapter, go to last verse of previous chapter
  if (chapter > 1) {
    const prevChapter = chapter - 1;
    const lastVerse = getLastVerse(book, prevChapter);
    return `${book}.${prevChapter}.${lastVerse}`;
  }

  // First verse of first chapter - no previous
  return reference;
}

class BibleOutlineDB {
  constructor() {
    this.dbName = 'BibleOutlineDB';
    this.version = 1;
    this.db = null;
  }

  async init() {
    console.log('Initializing database...');
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => {
        console.error('Database open error:', request.error);
        reject(request.error);
      };
      
      request.onsuccess = () => {
        this.db = request.result;
        console.log('Database opened successfully:', this.db);
        resolve();
      };

      request.onupgradeneeded = (event) => {
        console.log('Database upgrade needed, version:', event.oldVersion, '->', event.newVersion);
        const db = event.target.result;

        // Create headings object store
        if (!db.objectStoreNames.contains('headings')) {
          console.log('Creating headings object store...');
          const store = db.createObjectStore('headings', { 
            keyPath: 'id', 
            autoIncrement: true 
          });
          
          // Create indexes for efficient querying
          store.createIndex('book', 'book', { unique: false });
          store.createIndex('reference', 'reference', { unique: false });
          store.createIndex('level', 'level', { unique: false });
          store.createIndex('sortKey', 'sortKey', { unique: false });
          console.log('Object store created with indexes');
        }
      };
    });
  }

  // Parse reference like "Gen.1.1" or "Gen.1.1b" into components
  parseReference(reference) {
    const parts = reference.split('.');
    const verseRaw = parts[2] || '1';
    return {
      book: parts[0],
      chapter: parseInt(parts[1]),
      verse: parseInt(verseRaw),
      midVerse: verseRaw.endsWith('b')
    };
  }

  // Create a sort key for ordering headings
  // "Gen.1.1b" sorts after "Gen.1.1" and before "Gen.1.2"
  createSortKey(reference) {
    const { book, chapter, verse, midVerse } = this.parseReference(reference);
    const bookOrder = this.getBookOrder(book);
    const key = `${bookOrder.toString().padStart(3, '0')}.${chapter.toString().padStart(3, '0')}.${verse.toString().padStart(3, '0')}`;
    return midVerse ? key + 'b' : key;
  }

  // Get canonical order of book
  getBookOrder(bookCode) {
    const books = [
      'Gen', 'Exod', 'Lev', 'Num', 'Deut', 'Josh', 'Judg', 'Ruth',
      '1Sam', '2Sam', '1Kgs', '2Kgs', '1Chr', '2Chr', 'Ezra', 'Neh', 'Esth',
      'Job', 'Ps', 'Prov', 'Eccl', 'Song', 'Isa', 'Jer', 'Lam', 'Ezek', 'Dan',
      'Hos', 'Joel', 'Amos', 'Obad', 'Jonah', 'Mic', 'Nah', 'Hab', 'Zeph', 'Hag', 'Zech', 'Mal',
      'Matt', 'Mark', 'Luke', 'John', 'Acts', 'Rom', '1Cor', '2Cor', 'Gal', 'Eph', 'Phil', 'Col',
      '1Thess', '2Thess', '1Tim', '2Tim', 'Titus', 'Phlm', 'Heb', 'Jas', '1Pet', '2Pet',
      '1John', '2John', '3John', 'Jude', 'Rev'
    ];
    return books.indexOf(bookCode);
  }

  // Add a heading
  async addHeading(heading) {
    console.log('db.addHeading called with:', heading);
    console.log('Database object:', this.db);
    
    if (!this.db) {
      throw new Error('Database not initialized. Call init() first.');
    }
    
    const transaction = this.db.transaction(['headings'], 'readwrite');
    const store = transaction.objectStore('headings');
    
    const headingData = {
      ...heading,
      sortKey: this.createSortKey(heading.reference),
      createdAt: new Date().toISOString()
    };
    
    console.log('Heading data to save:', headingData);

    return new Promise((resolve, reject) => {
      const request = store.add(headingData);
      request.onsuccess = () => {
        console.log('addHeading success, id:', request.result);
        resolve(request.result);
      };
      request.onerror = () => {
        console.error('addHeading error:', request.error);
        reject(request.error);
      };
    });
  }

  // Get all headings for a book
  async getHeadingsByBook(bookCode) {
    const transaction = this.db.transaction(['headings'], 'readonly');
    const store = transaction.objectStore('headings');
    const index = store.index('book');

    return new Promise((resolve, reject) => {
      const request = index.getAll(bookCode);
      request.onsuccess = () => {
        const headings = request.result;
        // Sort by sortKey
        headings.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
        resolve(headings);
      };
      request.onerror = () => reject(request.error);
    });
  }

  // Get headings for multiple books, merged and sorted
  async getHeadingsByBooks(bookCodes) {
    const results = await Promise.all(bookCodes.map(code => this.getHeadingsByBook(code)));
    const merged = results.flat();
    merged.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
    return merged;
  }

  // Update a heading
  async updateHeading(id, updates) {
    const transaction = this.db.transaction(['headings'], 'readwrite');
    const store = transaction.objectStore('headings');

    return new Promise((resolve, reject) => {
      const getRequest = store.get(id);
      getRequest.onsuccess = () => {
        const heading = getRequest.result;
        const updatedHeading = { 
          ...heading, 
          ...updates,
          updatedAt: new Date().toISOString()
        };
        
        // Recalculate sort key if reference changed
        if (updates.reference) {
          updatedHeading.sortKey = this.createSortKey(updates.reference);
        }

        const putRequest = store.put(updatedHeading);
        putRequest.onsuccess = () => resolve(updatedHeading);
        putRequest.onerror = () => reject(putRequest.error);
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  // Delete a heading
  async deleteHeading(id) {
    const transaction = this.db.transaction(['headings'], 'readwrite');
    const store = transaction.objectStore('headings');

    return new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // Get all headings (for export)
  async getAllHeadings() {
    const transaction = this.db.transaction(['headings'], 'readonly');
    const store = transaction.objectStore('headings');

    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => {
        const headings = request.result;
        headings.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
        resolve(headings);
      };
      request.onerror = () => reject(request.error);
    });
  }

  // Return the OSIS reference of the last verse in a book, e.g. "2Sam.24.25"
  getLastVerseRef(bookCode) {
    const chapters = verseCountData[bookCode];
    if (!chapters) return null;
    const lastChapter = chapters.length;
    const lastVerse = chapters[lastChapter - 1];
    return `${bookCode}.${lastChapter}.${lastVerse}`;
  }

  // Calculate verse ranges based on heading hierarchy.
  // fallbackEndRef: used when no subsequent same-or-higher-level heading exists
  // (e.g. the last verse of the last book in the current view).
  calculateVerseRanges(headings, fallbackEndRef = null) {
    const result = [];

    for (let i = 0; i < headings.length; i++) {
      const current = headings[i];
      const startRef = current.reference;

      // Find next heading of same or higher level
      let endRef = null;
      for (let j = i + 1; j < headings.length; j++) {
        if (headings[j].level <= current.level) {
          endRef = getPreviousVerse(headings[j].reference);
          break;
        }
      }

      if (!endRef) {
        endRef = fallbackEndRef || startRef;
      }

      result.push({ ...current, startRef, endRef });
    }

    return result;
  }

  // Format reference for display
  formatReference(ref) {
    const parts = ref.split('.');
    return `${parts[1]}:${parts[2]}`;
  }
}

// Create global instance
const db = new BibleOutlineDB();
