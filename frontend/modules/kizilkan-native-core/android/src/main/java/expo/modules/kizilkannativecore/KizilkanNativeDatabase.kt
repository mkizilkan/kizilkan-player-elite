package expo.modules.kizilkannativecore

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

@Database(
  entities = [PlaylistSnapshotEntity::class, MediaItemEntity::class],
  version = 1,
  exportSchema = false,
)
abstract class KizilkanNativeDatabase : RoomDatabase() {
  abstract fun snapshotDao(): PlaylistSnapshotDao
  abstract fun mediaDao(): MediaItemDao

  companion object {
    @Volatile private var instance: KizilkanNativeDatabase? = null

    fun get(context: Context): KizilkanNativeDatabase = instance ?: synchronized(this) {
      instance ?: Room.databaseBuilder(
        context.applicationContext,
        KizilkanNativeDatabase::class.java,
        "kizilkan-native-core.db",
      )
        // Okuma/yazma paralelligi ve UI disi worker sorgulari icin WAL.
        .setJournalMode(RoomDatabase.JournalMode.WRITE_AHEAD_LOGGING)
        .build()
        .also { instance = it }
    }
  }
}
