// The foreground service of the Android app: while accounts run, Android keeps the process (and the sessions of
// cllt-core in it) alive with the screen off. A partial wake lock keeps the CPU running and a Wi-Fi lock the Wi-Fi; the
// lasting notification says how many accounts run, opens the app, and has Dừng tất cả.
package vn.colauloanthe.keepalive

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.wifi.WifiManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat

class KeepaliveService : Service() {
    private var wake: PowerManager.WakeLock? = null
    private var wifi: WifiManager.WifiLock? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        wake = getSystemService(PowerManager::class.java)
            ?.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "colautool:keepalive")
            ?.apply {
                setReferenceCounted(false)
                acquire()
            }
        @Suppress("DEPRECATION")
        wifi = applicationContext.getSystemService(WifiManager::class.java)
            ?.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "colautool:keepalive")
            ?.apply {
                setReferenceCounted(false)
                acquire()
            }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP_ALL) {
            KeepalivePlugin.instance?.stopAll()
            shutDown()
            return START_NOT_STICKY
        }
        count = intent?.getIntExtra(EXTRA_COUNT, count) ?: count
        val n = notification(this, count)
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        } else {
            startForeground(NOTIFICATION_ID, n)
        }
        running = true
        // Not restarted after Android ends the process: the sessions were in it, a service alone keeps nothing.
        return START_NOT_STICKY
    }

    private fun shutDown() {
        running = false
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onDestroy() {
        running = false
        wake?.let { if (it.isHeld) it.release() }
        wifi?.let { if (it.isHeld) it.release() }
        super.onDestroy()
    }

    companion object {
        private const val CHANNEL = "keepalive"
        private const val NOTIFICATION_ID = 7100
        private const val EXTRA_COUNT = "count"
        const val ACTION_STOP_ALL = "vn.colauloanthe.keepalive.STOP_ALL"

        @Volatile
        var running = false
            private set

        @Volatile
        private var count = 0

        /** Starts the service with `n` accounts, or says the new number on its notification when it runs. */
        fun run(context: Context, n: Int) {
            count = n
            if (running) {
                context.getSystemService(NotificationManager::class.java)?.notify(NOTIFICATION_ID, notification(context, n))
                return
            }
            val intent = Intent(context, KeepaliveService::class.java).putExtra(EXTRA_COUNT, n)
            try {
                ContextCompat.startForegroundService(context, intent)
            } catch (e: Exception) {
                // Android 12+ refuses a start while the app is in the background: the next start in front starts it.
                Log.w(KeepalivePlugin.TAG, "startForegroundService: $e")
                throw e
            }
        }

        fun stop(context: Context) {
            if (!running) return
            running = false
            context.stopService(Intent(context, KeepaliveService::class.java))
        }

        private fun notification(context: Context, n: Int): Notification {
            val manager = context.getSystemService(NotificationManager::class.java)
            if (Build.VERSION.SDK_INT >= 26 && manager?.getNotificationChannel(CHANNEL) == null) {
                manager?.createNotificationChannel(
                    NotificationChannel(CHANNEL, "Nick đang chạy", NotificationManager.IMPORTANCE_LOW).apply {
                        description = "Giữ các nick chạy khi tắt màn hình"
                        setShowBadge(false)
                    }
                )
            }
            val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            val open = context.packageManager.getLaunchIntentForPackage(context.packageName)?.let {
                PendingIntent.getActivity(context, 0, it, flags)
            }
            val stopAll = PendingIntent.getService(
                context, 1, Intent(context, KeepaliveService::class.java).setAction(ACTION_STOP_ALL), flags
            )
            return NotificationCompat.Builder(context, CHANNEL)
                .setSmallIcon(context.applicationInfo.icon)
                .setContentTitle("Co Lau Tool: $n nick đang chạy")
                .setContentText("Tắt màn hình các nick vẫn chạy. Bấm để mở app.")
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setShowWhen(false)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setCategory(NotificationCompat.CATEGORY_SERVICE)
                .setContentIntent(open)
                .addAction(0, "Dừng tất cả", stopAll)
                .build()
        }
    }
}
