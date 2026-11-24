// The Tauri plugin of the Android app (../../../../../../src/android.rs calls it): setRunning starts, updates or stops
// KeepaliveService; Dừng tất cả of its notification comes back to Rust as the "stopAll" event (registerListener).
// shareImage opens the share sheet on a picture of the app's cache (the QR of QR nick). installApk opens the installer
// of Android on the APK of a newer version the app downloaded (update.rs of the app).
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

@InvokeArg
class ApkArgs {
    var path: String = ""
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

    /** The installer of Android on the APK at `path`, in the app's cache (FileProvider, as shareImage). Android asks the
     * user to allow the app to install apps once (Cài ứng dụng không rõ nguồn gốc): without that the screen of that
     * setting opens instead and the call fails with "allow", for the user to press Cập nhật again once allowed. The
     * installer replaces this app, keeping its data (same package, same signing key). */
    @Command
    fun installApk(invoke: Invoke) {
        val args = invoke.parseArgs(ApkArgs::class.java)
        try {
            if (Build.VERSION.SDK_INT >= 26 && !activity.packageManager.canRequestPackageInstalls()) {
                activity.runOnUiThread {
                    activity.startActivity(
                        Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${activity.packageName}"))
                    )
                }
                invoke.reject("allow")
                return
            }
            val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.fileprovider", File(args.path))
            val install = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, "application/vnd.android.package-archive")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            activity.runOnUiThread { activity.startActivity(install) }
            invoke.resolve()
        } catch (e: Exception) {
            Log.w(TAG, "installApk(${args.path}): $e")
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
