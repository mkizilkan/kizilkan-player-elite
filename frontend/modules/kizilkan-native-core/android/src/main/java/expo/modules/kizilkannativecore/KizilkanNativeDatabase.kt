package expo.modules.kizilkannativecore

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(
  entities = [PlaylistSnapshotEntity::class, MediaItemEntity::class, EpgProgramEntity::class],
  version = 2,
  exportSchema = false,
)
abstract class KizilkanNativeDatabase : RoomDatabase() {
  abstract fun snapshotDao(): PlaylistSnapshotDao
  abstract fun mediaDao(): MediaItemDao
  abstract fun epgDao(): EpgProgramDao

  companion object {
    @Volatile private var instance: KizilkanNativeDatabase? = null

    private val MIGRATION_1_2 = object : Migration(1, 2) {
      override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("CREATE TABLE IF NOT EXISTS `epg_programs` (`rowKey` TEXT NOT NULL, `playlistId` TEXT NOT NULL, `channelId` TEXT NOT NULL, `title` TEXT NOT NULL, `description` TEXT, `startIso` TEXT NOT NULL, `stopIso` TEXT NOT NULL, `startTimestamp` INTEGER NOT NULL, `stopTimestamp` INTEGER NOT NULL, PRIMARY KEY(`rowKey`))")
        db.execSQL("CREATE INDEX IF NOT EXISTS `index_epg_programs_playlistId_channelId_startTimestamp` ON `epg_programs` (`playlistId`, `channelId`, `startTimestamp`)")
        db.execSQL("CREATE INDEX IF NOT EXISTS `index_epg_programs_playlistId_channelId_stopTimestamp` ON `epg_programs` (`playlistId`, `channelId`, `stopTimestamp`)")
      }
    }

    fun get(context: Context): KizilkanNativeDatabase = instance ?: synchronized(this) {
      instance ?: Room.databaseBuilder(
        context.applicationContext,
        KizilkanNativeDatabase::class.java,
        "kizilkan-native-core.db",
      )
        // Okuma/yazma paralelligi ve UI disi worker sorgulari icin WAL.
        .setJournalMode(RoomDatabase.JournalMode.WRITE_AHEAD_LOGGING)
        .addMigrations(MIGRATION_1_2)
        .build()
        .also { instance = it }
    }
  }
}
