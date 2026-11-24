// The Tauri plugin of the Android app (../../../../../../src/android.rs calls it): setRunning starts, updates or stops
// KeepaliveService; Dừng tất cả of its notification comes back to Rust as the "stopAll" event (registerListener).
// shareImage opens the share sheet on a picture of the app's cache (the QR of QR nick).
package vn.colauloanthe.keepalive

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.util.Log
import java.io.File
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@InvokeArg
class RunningArgs {
    var count: Int = 0
}

@InvokeArg
class ShareArgs {
    var path: String = ""
    var title: String = ""
}

@TauriPlugin
class KeepalivePlugin(private val activity: Activity) : Plugin(activity) {
    /** The permissions are asked once a run, at the first start of the service. */
    private var asked = false

    init {
        instance = this
    }

    /** `count` accounts run: the service starts (or says the new count), or stops at 0. */
    @Command
    fun setRunning(invoke: Invoke) {
        val count = invoke.parseArgs(RunningArgs::class.java).count
        try {
            val context = activity.applicationContext
            if (count > 0) {
                if (!asked) {
                    asked = true
                    activity.runOnUiThread { askPermissions() }
                }
                KeepaliveService.run(context, count)
            } else {
                KeepaliveService.stop(context)
            }
            val ret = JSObject()
            ret.put("running", KeepaliveService.running)
            invoke.resolve(ret)
        } catch (e: Exception) {
            Log.w(TAG, "setRunning($count): $e")
            invoke.reject(e.message ?: e.toString())
        }
    }

    /** The share sheet (Zalo, Messenger, Lưu vào ảnh…) on the PNG at `path`, in the app's cache: FileProvider of the
     * app's manifest (cache-path of res/xml/file_paths.xml) lends it to the app picked. */
    @Command
    fun shareImage(invoke: Invoke) {
        val args = invoke.parseArgs(ShareArgs::class.java)
        try {
            val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.fileprovider", File(args.path))
            val send = Intent(Intent.ACTION_SEND).apply {
                type = "image/png"
                putExtra(Intent.EXTRA_STREAM, uri)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            activity.runOnUiThread { activity.startActivity(Intent.createChooser(send, args.title)) }
            invoke.resolve()
        } catch (e: Exception) {
            Log.w(TAG, "shareImage(${args.path}): $e")
            invoke.reject(e.message ?: e.toString())
        }
    }

    /** Dừng tất cả of the notification: Rust logs every account out (lib.rs of the app). */
    fun stopAll() {
        trigger("stopAll", JSObject())
    }

    /** The notification of the service (Android 13), and the app out of battery optimisation, which would stop it. */
    @SuppressLint("BatteryLife")
    private fun askPermissions() {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(activity, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            ActivityCompat.requestPermissions(activity, arrayOf(Manifest.permission.POST_NOTIFICATIONS), 7101)
        }
        val power = activity.getSystemService(PowerManager::class.java)
        if (power != null && !power.isIgnoringBatteryOptimizations(activity.packageName)) {
            try {
                activity.startActivity(
                    Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:${activity.packageName}"))
                )
            } catch (e: Exception) {
                Log.w(TAG, "battery optimisation: $e")
            }
        }
    }

    companion object {
        const val TAG = "Keepalive"

        @Volatile
        var instance: KeepalivePlugin? = null
    }
}
