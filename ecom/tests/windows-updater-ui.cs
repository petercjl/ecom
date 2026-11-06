// Render and validate the actual progress-only component without a browser,
// network requests, account data or desktop automation.
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Linq;
using System.Text;
using System.Windows.Forms;
namespace EcomUpdate {
  static class ProgressUiTestMain {
    [STAThread] public static int Main(string[] args) {
      try {
        Program.Require(args.Length==4&&args.All(p=>!File.Exists(p)),"Supply new download preview, ready preview, report and installation preview paths");
        Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
        using(var view=new DownloadProgressView()) {
          Program.Require(!view.Controls.OfType<Button>().Any()&&!view.Controls.OfType<ComboBox>().Any(),"Progress view contains unrelated actions");
          var meter=(ProgressBar)view.Controls["progress"];var percentage=(Label)view.Controls["percentage"];
          view.SetProgress(0,0,"正在准备更新","正在获取更新信息…");
          Program.Require(meter.Style==ProgressBarStyle.Marquee&&percentage.Text=="","Unknown total must be indeterminate");
          view.SetProgress(16000000,250000000,"正在下载更新",null);
          Program.Require(percentage.Text=="6%"&&meter.Style==ProgressBarStyle.Continuous,"Overall progress is incorrect");
          Program.Require(view.Controls["amount"].Text.Contains("MB / "),"Downloaded and total size missing");
          view.SetProgress(162500000,250000000,"正在下载更新",null);view.CreateControl();
          using(var bitmap=new Bitmap(view.Width,view.Height)){view.DrawToBitmap(bitmap,new Rectangle(Point.Empty,view.Size));using(var output=new FileStream(args[0],FileMode.CreateNew))bitmap.Save(output,ImageFormat.Png);}
          view.SetProgress(250000000,250000000,"正在校验更新包","下载完成，正在验证完整性…");
          Program.Require(percentage.Text=="100%"&&meter.Value==meter.Maximum,"Completed download is not represented correctly");
        }
        using(var view=new ReadyUpdateView()) {
          int restarted=0,deferred=0;view.RestartRequested+=(sender,e)=>restarted++;view.DeferredRequested+=(sender,e)=>deferred++;
          view.SetVersion("0.1.1");view.CreateControl();((Button)view.Controls["later"]).PerformClick();
          Program.Require(deferred==1&&restarted==0,"Deferral must not request a restart");
          ((Button)view.Controls["restart"]).PerformClick();Program.Require(restarted==1,"Explicit restart consent was not delivered");
          using(var bitmap=new Bitmap(view.Width,view.Height)){view.DrawToBitmap(bitmap,new Rectangle(Point.Empty,view.Size));using(var output=new FileStream(args[1],FileMode.CreateNew))bitmap.Save(output,ImageFormat.Png);}
        }
        using(var form=new InstallProgressForm()) {
          var view=form.Controls.OfType<DownloadProgressView>().Single();
          Program.Require(view.Controls["elapsed"].Text.Contains("00:00"),"Elapsed time must be visible immediately");
          form.SetProgress(new InstallProgress("backup","正在备份当前版本","正在复制并校验回滚所需的程序文件…",350,700));
          Program.Require(view.Controls["percentage"].Text=="50%","Verified backup progress is missing");
          form.SetProgress(new InstallProgress("installing","正在安装 Ecom","正在解压并替换程序文件。完成后将自动打开 Ecom。"));
          Program.Require(((ProgressBar)view.Controls["progress"]).Style==ProgressBarStyle.Marquee&&view.Controls["percentage"].Text=="","Installer progress must not invent a percentage");
          form.Show();Application.DoEvents();form.Close();Program.Require(!form.IsDisposed,"Closing the window interrupted installation presentation");
          using(var bitmap=new Bitmap(form.Width,form.Height)){form.DrawToBitmap(bitmap,new Rectangle(Point.Empty,form.Size));using(var output=new FileStream(args[3],FileMode.CreateNew))bitmap.Save(output,ImageFormat.Png);}
          form.Finish();Program.Require(form.IsDisposed,"Successful installation window did not close");
        }
        using(var stream=new FileStream(args[2],FileMode.CreateNew)){byte[] report=Encoding.UTF8.GetBytes("{\"ok\":true,\"progressOnly\":true,\"unknownTotal\":true,\"overallPercentage\":true,\"downloadedAndTotalBytes\":true,\"verificationState\":true,\"deferWithoutRestart\":true,\"explicitRestartConsent\":true,\"installationProgress\":true,\"backupPercentage\":true,\"installerIndeterminate\":true,\"closeGuard\":true}");stream.Write(report,0,report.Length);}return 0;
      }catch(Exception e){Console.Error.WriteLine(e.Message);return 1;}
    }
  }
}
