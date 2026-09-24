package expo.modules.kizilkannativecore

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query

@Dao
interface PlaylistSnapshotDao {
  @Query("SELECT * FROM playlist_snapshots WHERE playlistId = :playlistId LIMIT 1")
  fun get(playlistId: String): PlaylistSnapshotEntity?

  /**
   * v17.9.5 — TEŞHİS: Tüm snapshot envanteri (yetim liste tespiti).
   * Room'da 58 snapshot varken arayüz 0-1 liste görüyor. Bu sorgu her
   * snapshot'ın kimliğini, sayılarını ve tarihini verir; JS tarafı meta ile
   * karşılaştırıp kaçının "yetim" (meta'da karşılıksız) olduğunu ölçer.
   * SADECE OKUMA — hiçbir şey silmez.
   */
  @Query("SELECT * FROM playlist_snapshots ORDER BY importedAtEpochMs DESC")
  fun getAllSnapshots(): List<PlaylistSnapshotEntity>

  @Insert(onConflict = OnConflictStrategy.REPLACE)
  fun put(snapshot: PlaylistSnapshotEntity)

  @Query("DELETE FROM playlist_snapshots WHERE playlistId = :playlistId")
  fun delete(playlistId: String)

  // v17.2.0: playlist satırını koruyarak canonical cache'i geçersiz kıl.
  @Query("UPDATE playlist_snapshots SET sourceStamp = -1, sourceSize = -1 WHERE playlistId = :playlistId")
  fun invalidate(playlistId: String): Int

  @Query("DELETE FROM playlist_snapshots")
  fun clear()
}

@Dao
interface MediaItemDao {
  @Insert(onConflict = OnConflictStrategy.REPLACE)
  fun insertAll(items: List<MediaItemEntity>)

  @Query("DELETE FROM media_items WHERE playlistId = :playlistId")
  fun deletePlaylist(playlistId: String): Int

  @Query("DELETE FROM media_items WHERE playlistId = :playlistId AND kind = :kind")
  fun deleteKind(playlistId: String, kind: String): Int

  /** v15.2.14: backup restore swap için satırları JS'e taşımadan playlist kimliğini değiştir. */
  @Query("UPDATE media_items SET rowKey = :toId || substr(rowKey, length(:fromId) + 1), playlistId = :toId WHERE playlistId = :fromId")
  fun movePlaylist(fromId: String, toId: String): Int

  @Query("DELETE FROM media_items")
  fun clear()

  @Query("SELECT COUNT(*) FROM media_items")
  fun totalCount(): Int

  @Query("SELECT COUNT(*) FROM media_items WHERE playlistId NOT IN (SELECT playlistId FROM playlist_snapshots)")
  fun orphanCount(): Int

  @Query("DELETE FROM media_items WHERE playlistId NOT IN (SELECT playlistId FROM playlist_snapshots)")
  fun deleteOrphans(): Int

  @Query("SELECT COUNT(*) FROM media_items WHERE playlistId = :playlistId AND kind = :kind")
  fun count(playlistId: String, kind: String): Int

  /**
   * v17.9.1 — Yenileme fark raporu için bir türün öğe kimlikleri.
   * [playlistId, kind, itemId] indeksi sayesinde yalnız indeks okunur; ham
   * JSON (rawJson) yüklenmez. Fark native tarafta hesaplanır, JS'e 50 bin
   * öğe taşınmaz.
   */
  @Query("SELECT itemId FROM media_items WHERE playlistId = :playlistId AND kind = :kind")
  fun itemIds(playlistId: String, kind: String): List<String>

  @Query("""
    SELECT groupName AS name, COUNT(*) AS count
    FROM media_items
    WHERE playlistId = :playlistId AND kind = :kind
    GROUP BY groupName
    ORDER BY MIN(sortOrder)
  """)
  fun categories(playlistId: String, kind: String): List<CategoryCountRow>

  @Query("""
    SELECT rawJson FROM media_items
    WHERE playlistId = :playlistId
      AND kind = :kind
      AND (:groupName = '__all__' OR groupName = :groupName)
      AND (:query = '' OR searchText LIKE '%' || :query || '%')
    ORDER BY sortOrder
    LIMIT :limit OFFSET :offset
  """)
  fun queryRaw(
    playlistId: String,
    kind: String,
    groupName: String,
    query: String,
    offset: Int,
    limit: Int,
  ): List<String>

  @Query("""
    SELECT COUNT(*) FROM media_items
    WHERE playlistId = :playlistId
      AND kind = :kind
      AND (:groupName = '__all__' OR groupName = :groupName)
      AND (:query = '' OR searchText LIKE '%' || :query || '%')
  """)
  fun queryCount(playlistId: String, kind: String, groupName: String, query: String): Int

  @Query("""
    SELECT rawJson FROM media_items
    WHERE playlistId = :playlistId AND kind = :kind AND itemId = :itemId
    ORDER BY sortOrder
    LIMIT 1
  """)
  fun getItemRaw(playlistId: String, kind: String, itemId: String): String?

  @Query("SELECT rawJson FROM media_items WHERE playlistId = :playlistId AND kind = :kind AND itemId IN (:itemIds)")
  fun getItemsRaw(playlistId: String, kind: String, itemIds: List<String>): List<String>

  /** v17.0.0: Player hot-path komşu çözümü. Büyük kataloğu JS'e taşımadan
   *  mevcut Room sırasına ve görünür group/search scope'una göre prev/next bulur. */
  @Query("SELECT sortOrder FROM media_items WHERE playlistId = :playlistId AND kind = :kind AND itemId = :itemId ORDER BY sortOrder LIMIT 1")
  fun getSortOrder(playlistId: String, kind: String, itemId: String): Int?

  @Query("""
    SELECT rawJson FROM media_items
    WHERE playlistId = :playlistId AND kind = :kind
      AND (:groupName = '__all__' OR groupName = :groupName)
      AND (:query = '' OR searchText LIKE '%' || :query || '%')
      AND sortOrder < :currentSortOrder
    ORDER BY sortOrder DESC LIMIT 1
  """)
  fun previousRaw(playlistId: String, kind: String, groupName: String, query: String, currentSortOrder: Int): String?

  @Query("""
    SELECT rawJson FROM media_items
    WHERE playlistId = :playlistId AND kind = :kind
      AND (:groupName = '__all__' OR groupName = :groupName)
      AND (:query = '' OR searchText LIKE '%' || :query || '%')
      AND sortOrder > :currentSortOrder
    ORDER BY sortOrder ASC LIMIT 1
  """)
  fun nextRaw(playlistId: String, kind: String, groupName: String, query: String, currentSortOrder: Int): String?

  @Query("""
    SELECT rawJson FROM media_items
    WHERE playlistId = :playlistId AND kind = :kind
      AND (:groupName = '__all__' OR groupName = :groupName)
      AND (:query = '' OR searchText LIKE '%' || :query || '%')
    ORDER BY sortOrder ASC LIMIT 1
  """)
  fun firstRaw(playlistId: String, kind: String, groupName: String, query: String): String?

  @Query("""
    SELECT rawJson FROM media_items
    WHERE playlistId = :playlistId AND kind = :kind
      AND (:groupName = '__all__' OR groupName = :groupName)
      AND (:query = '' OR searchText LIKE '%' || :query || '%')
    ORDER BY sortOrder DESC LIMIT 1
  """)
  fun lastRaw(playlistId: String, kind: String, groupName: String, query: String): String?

  @Query("""
    SELECT COUNT(*) FROM media_items
    WHERE playlistId = :playlistId AND kind = :kind
      AND (:groupName = '__all__' OR groupName = :groupName)
      AND (:query = '' OR searchText LIKE '%' || :query || '%')
  """)
  fun scopedCount(playlistId: String, kind: String, groupName: String, query: String): Int

  @Query("""
    SELECT COUNT(*) FROM media_items
    WHERE playlistId = :playlistId AND kind = :kind
      AND (:groupName = '__all__' OR groupName = :groupName)
      AND (:query = '' OR searchText LIKE '%' || :query || '%')
      AND sortOrder < :currentSortOrder
  """)
  fun scopedCountBefore(playlistId: String, kind: String, groupName: String, query: String, currentSortOrder: Int): Int

  @Query("SELECT rawJson FROM media_items WHERE playlistId = :playlistId AND kind = :kind ORDER BY sortOrder")
  fun allRaw(playlistId: String, kind: String): List<String>
}


@Dao
interface EpgProgramDao {
  @Insert(onConflict = OnConflictStrategy.REPLACE)
  fun insertAll(items: List<EpgProgramEntity>)

  @Query("DELETE FROM epg_programs WHERE playlistId = :playlistId")
  fun deletePlaylist(playlistId: String): Int

  /** v15.2.14: atomik restore rollback sırasında mevcut EPG de korunur. */
  @Query("UPDATE epg_programs SET rowKey = :toId || substr(rowKey, length(:fromId) + 1), playlistId = :toId WHERE playlistId = :fromId")
  fun movePlaylist(fromId: String, toId: String): Int

  @Query("DELETE FROM epg_programs")
  fun clear()

  @Query("SELECT COUNT(*) FROM epg_programs")
  fun totalCount(): Int

  @Query("SELECT COUNT(*) FROM epg_programs WHERE playlistId NOT IN (SELECT playlistId FROM playlist_snapshots)")
  fun orphanCount(): Int

  @Query("DELETE FROM epg_programs WHERE playlistId NOT IN (SELECT playlistId FROM playlist_snapshots)")
  fun deleteOrphans(): Int

  @Query("SELECT COUNT(*) FROM epg_programs WHERE stopTimestamp < :beforeSec")
  fun expiredCount(beforeSec: Long): Int

  @Query("DELETE FROM epg_programs WHERE stopTimestamp < :beforeSec")
  fun deleteExpired(beforeSec: Long): Int

  @Query("SELECT COUNT(*) FROM epg_programs WHERE playlistId = :playlistId")
  fun count(playlistId: String): Int

  @Query("SELECT * FROM epg_programs WHERE playlistId = :playlistId AND channelId = :channelId ORDER BY startTimestamp")
  fun channelPrograms(playlistId: String, channelId: String): List<EpgProgramEntity>

  @Query("""
    SELECT * FROM epg_programs
    WHERE playlistId = :playlistId
      AND channelId IN (:channelIds)
      AND stopTimestamp > :nowSec
      AND startTimestamp < :windowEndSec
    ORDER BY channelId, startTimestamp
  """)
  fun window(playlistId: String, channelIds: List<String>, nowSec: Long, windowEndSec: Long): List<EpgProgramEntity>
}

@Dao
interface DiagnosticEventDao {
  @Insert(onConflict = OnConflictStrategy.REPLACE)
  fun insert(item: DiagnosticEventEntity)

  @Query("SELECT * FROM diagnostic_events ORDER BY atEpochMs DESC LIMIT :limit")
  fun latest(limit: Int): List<DiagnosticEventEntity>

  @Query("SELECT * FROM diagnostic_events WHERE critical = 1 ORDER BY atEpochMs DESC LIMIT :limit")
  fun latestCritical(limit: Int): List<DiagnosticEventEntity>

  @Query("SELECT COUNT(*) FROM diagnostic_events")
  fun count(): Int

  @Query("SELECT COUNT(*) FROM diagnostic_events WHERE critical = 1")
  fun criticalCount(): Int

  @Query("DELETE FROM diagnostic_events WHERE id IN (SELECT id FROM diagnostic_events WHERE critical = 0 ORDER BY atEpochMs ASC LIMIT :count)")
  fun deleteOldestNormal(count: Int): Int

  @Query("DELETE FROM diagnostic_events WHERE id IN (SELECT id FROM diagnostic_events WHERE critical = 1 ORDER BY atEpochMs ASC LIMIT :count)")
  fun deleteOldestCritical(count: Int): Int

  @Query("DELETE FROM diagnostic_events")
  fun clear(): Int

  @Query("SELECT COUNT(*) FROM diagnostic_events WHERE critical = 0 AND atEpochMs < :beforeEpochMs")
  fun expiredNormalCount(beforeEpochMs: Long): Int

  @Query("SELECT COUNT(*) FROM diagnostic_events WHERE critical = 1 AND atEpochMs < :beforeEpochMs")
  fun expiredCriticalCount(beforeEpochMs: Long): Int

  @Query("DELETE FROM diagnostic_events WHERE critical = 0 AND atEpochMs < :beforeEpochMs")
  fun deleteExpiredNormal(beforeEpochMs: Long): Int

  @Query("DELETE FROM diagnostic_events WHERE critical = 1 AND atEpochMs < :beforeEpochMs")
  fun deleteExpiredCritical(beforeEpochMs: Long): Int
}
