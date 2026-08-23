package expo.modules.kizilkannativecore

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query

@Dao
interface PlaylistSnapshotDao {
  @Query("SELECT * FROM playlist_snapshots WHERE playlistId = :playlistId LIMIT 1")
  fun get(playlistId: String): PlaylistSnapshotEntity?

  @Insert(onConflict = OnConflictStrategy.REPLACE)
  fun put(snapshot: PlaylistSnapshotEntity)

  @Query("DELETE FROM playlist_snapshots WHERE playlistId = :playlistId")
  fun delete(playlistId: String)

  @Query("DELETE FROM playlist_snapshots")
  fun clear()
}

@Dao
interface MediaItemDao {
  @Insert(onConflict = OnConflictStrategy.REPLACE)
  fun insertAll(items: List<MediaItemEntity>)

  @Query("DELETE FROM media_items WHERE playlistId = :playlistId")
  fun deletePlaylist(playlistId: String)

  @Query("DELETE FROM media_items")
  fun clear()

  @Query("SELECT COUNT(*) FROM media_items WHERE playlistId = :playlistId AND kind = :kind")
  fun count(playlistId: String, kind: String): Int

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

  @Query("SELECT rawJson FROM media_items WHERE playlistId = :playlistId AND kind = :kind ORDER BY sortOrder")
  fun allRaw(playlistId: String, kind: String): List<String>
}


@Dao
interface EpgProgramDao {
  @Insert(onConflict = OnConflictStrategy.REPLACE)
  fun insertAll(items: List<EpgProgramEntity>)

  @Query("DELETE FROM epg_programs WHERE playlistId = :playlistId")
  fun deletePlaylist(playlistId: String)

  @Query("DELETE FROM epg_programs")
  fun clear()

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
