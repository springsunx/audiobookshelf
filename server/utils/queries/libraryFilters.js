const Database = require('../../Database')
const Logger = require('../../Logger')
const libraryItemsBookFilters = require('./libraryItemsBookFilters')
const libraryItemsPodcastFilters = require('./libraryItemsPodcastFilters')

module.exports = {
  decode(text) {
    return Buffer.from(decodeURIComponent(text), 'base64').toString()
  },

  /**
   * Get library items using filter and sort
   * @param {oldLibrary} library 
   * @param {string} userId 
   * @param {object} options 
   * @returns {object} { libraryItems:LibraryItem[], count:number }
   */
  async getFilteredLibraryItems(library, userId, options) {
    const { filterBy, sortBy, sortDesc, limit, offset, collapseseries, include, mediaType } = options

    let filterValue = null
    let filterGroup = null
    if (filterBy) {
      const searchGroups = ['genres', 'tags', 'series', 'authors', 'progress', 'narrators', 'publishers', 'missing', 'languages', 'tracks', 'ebooks']
      const group = searchGroups.find(_group => filterBy.startsWith(_group + '.'))
      filterGroup = group || filterBy
      filterValue = group ? this.decode(filterBy.replace(`${group}.`, '')) : null
    }

    if (mediaType === 'book') {
      return libraryItemsBookFilters.getFilteredLibraryItems(library.id, userId, filterGroup, filterValue, sortBy, sortDesc, collapseseries, include, limit, offset)
    } else {
      return libraryItemsPodcastFilters.getFilteredLibraryItems(library.id, userId, filterGroup, filterValue, sortBy, sortDesc, include, limit, offset)
    }
  },

  /**
   * Get library items for continue listening & continue reading shelves
   * @param {oldLibrary} library 
   * @param {string} userId 
   * @param {string[]} include 
   * @param {number} limit 
   * @param {boolean} ebook true if continue reading shelf
   * @returns {object} { libraryItems:LibraryItem[], count:number }
   */
  async getLibraryItemsInProgress(library, userId, include, limit, ebook = false) {
    if (library.mediaType === 'book') {
      const filterValue = ebook ? 'ebook-in-progress' : 'audio-in-progress'
      const { libraryItems, count } = await libraryItemsBookFilters.getFilteredLibraryItems(library.id, userId, 'progress', filterValue, 'progress', true, false, include, limit, 0)
      return {
        libraryItems: libraryItems.map(li => {
          const oldLibraryItem = Database.models.libraryItem.getOldLibraryItem(li).toJSONMinified()
          if (li.rssFeed) {
            oldLibraryItem.rssFeed = Database.models.feed.getOldFeed(li.rssFeed).toJSONMinified()
          }
          return oldLibraryItem
        }),
        count
      }
    } else {
      return {
        count: 0,
        libraryItems: []
      }
    }
  },

  /**
   * Get library items for most recently added shelf
   * @param {oldLibrary} library 
   * @param {string} userId 
   * @param {string[]} include 
   * @param {number} limit 
   * @returns {object} { libraryItems:LibraryItem[], count:number }
   */
  async getLibraryItemsMostRecentlyAdded(library, userId, include, limit) {
    if (library.mediaType === 'book') {
      const { libraryItems, count } = await libraryItemsBookFilters.getFilteredLibraryItems(library.id, userId, null, null, 'addedAt', true, false, include, limit, 0)
      return {
        libraryItems: libraryItems.map(li => {
          const oldLibraryItem = Database.models.libraryItem.getOldLibraryItem(li).toJSONMinified()
          if (li.rssFeed) {
            oldLibraryItem.rssFeed = Database.models.feed.getOldFeed(li.rssFeed).toJSONMinified()
          }
          if (li.size && !oldLibraryItem.media.size) {
            oldLibraryItem.media.size = li.size
          }
          return oldLibraryItem
        }),
        count
      }
    } else {
      const { libraryItems, count } = await libraryItemsPodcastFilters.getFilteredLibraryItems(library.id, userId, null, null, 'addedAt', true, include, limit, 0)
      return {
        libraryItems: libraryItems.map(li => {
          const oldLibraryItem = Database.models.libraryItem.getOldLibraryItem(li).toJSONMinified()
          if (li.rssFeed) {
            oldLibraryItem.rssFeed = Database.models.feed.getOldFeed(li.rssFeed).toJSONMinified()
          }
          if (li.size && !oldLibraryItem.media.size) {
            oldLibraryItem.media.size = li.size
          }
          return oldLibraryItem
        }),
        count
      }
    }
  },

  /**
   * Get library items for continue series shelf
   * @param {string} library 
   * @param {string} userId 
   * @param {string[]} include 
   * @param {number} limit 
   * @returns {object} { libraryItems:LibraryItem[], count:number }
   */
  async getLibraryItemsContinueSeries(library, userId, include, limit) {
    const { libraryItems, count } = await libraryItemsBookFilters.getContinueSeriesLibraryItems(library.id, userId, include, limit, 0)
    return {
      libraryItems: libraryItems.map(li => {
        const oldLibraryItem = Database.models.libraryItem.getOldLibraryItem(li).toJSONMinified()
        if (li.rssFeed) {
          oldLibraryItem.rssFeed = Database.models.feed.getOldFeed(li.rssFeed).toJSONMinified()
        }
        if (li.series) {
          oldLibraryItem.media.metadata.series = li.series
        }
        return oldLibraryItem
      }),
      count
    }
  },

  /**
   * Get series for recent series shelf
   * @param {oldLibrary} library 
   * @param {string[]} include 
   * @param {number} limit 
   * @returns {object} { series:oldSeries[], count:number}
   */
  async getSeriesMostRecentlyAdded(library, include, limit) {
    const seriesIncludes = []
    if (include.includes('rssfeed')) {
      seriesIncludes.push({
        model: Database.models.feed
      })
    }
    const { rows: series, count } = await Database.models.series.findAndCountAll({
      where: {
        libraryId: library.id
      },
      limit,
      offset: 0,
      distinct: true,
      subQuery: false,
      include: [
        {
          model: Database.models.bookSeries,
          include: {
            model: Database.models.book,
            include: {
              model: Database.models.libraryItem
            }
          },
          separate: true
        },
        ...seriesIncludes
      ],
      order: [
        ['createdAt', 'DESC']
      ]
    })

    Logger.debug(`Found ${series.length} series recently added (${count} total)`)

    const allOldSeries = []
    for (const s of series) {
      const oldSeries = s.getOldSeries().toJSON()

      if (s.feeds?.length) {
        oldSeries.rssFeed = Database.models.feed.getOldFeed(s.feeds[0]).toJSONMinified()
      }

      // TODO: Sort books by sequence in query
      s.bookSeries.sort((a, b) => {
        if (!a.sequence) return 1
        if (!b.sequence) return -1
        return a.sequence.localeCompare(b.sequence, undefined, {
          numeric: true,
          sensitivity: 'base'
        })
      })
      oldSeries.books = s.bookSeries.map(bs => {
        const libraryItem = bs.book.libraryItem.toJSON()
        delete bs.book.libraryItem
        libraryItem.media = bs.book
        const oldLibraryItem = Database.models.libraryItem.getOldLibraryItem(libraryItem).toJSONMinified()
        return oldLibraryItem
      })
      allOldSeries.push(oldSeries)
    }

    return {
      series: allOldSeries,
      count
    }
  }
}