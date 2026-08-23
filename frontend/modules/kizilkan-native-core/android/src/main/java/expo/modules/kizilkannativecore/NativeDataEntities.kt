package expo.modules.kizilkannativecore

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * Playlist'in diskteki kaynak blobuyla Room indeksinin birebir aynı sürümü
 * temsil ettiğini kanıtlayan snapshot. stamp+size değişirse index yeniden kurulur.
 */
@Entity(tableName = "playlist_snapshots")
data class PlaylistSnapshotEntity(
  @PrimaryKey val playlistId: String,
  val sourceStamp: Long,
  val sourceSize: Long,
  val channelsCount: Int,
  val vodCount: Int,
  val seriesCount: Int,
  val importedAtEpochMs: Long,
  val importMs: Long,
)

/**
 * React tarafına dev koleksiyon taşımak yerine SQLite içinde indekslenen medya kaydı.
 * rawJson mevcut Playlist/Channel/VOD/Series sözleşmesini KAYIPSIZ korur; UI yalnız
 * istediği sayfayı sorguladığında 50-100 kaydın JSON'u Map'e dönüştürülür.
 */
@Entity(
  tableName = "media_items",
  indices = [
    Index(value = ["playlistId", "kind", "sortOrder"]),
    Index(value = ["playlistId", "kind", "groupName", "sortOrder"]),
    Index(value = ["playlistId", "kind", "itemId"]),
    Index(value = ["playlistId", "kind", "normalizedName"]),
  ],
)
data class MediaItemEntity(
  @PrimaryKey val rowKey: String,
  val playlistId: String,
  val kind: String,
  val itemId: String,
  val name: String,
  val normalizedName: String,
  val groupName: String,
  val searchText: String,
  val sortOrder: Int,
  val rawJson: String,
)

data class CategoryCountRow(
  val name: String,
  val count: Int,
)
