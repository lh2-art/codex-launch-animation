using System;
using System.Runtime.InteropServices;
using System.Text;
public static class StartupWindows {
 delegate bool EnumProc(IntPtr window,IntPtr value);
 [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left,Top,Right,Bottom; }
 [StructLayout(LayoutKind.Sequential)] struct MonitorInfo { public int Size;public Rect Monitor,Work;public uint Flags; }
 [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc callback,IntPtr value);
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window,out uint pid);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr window,StringBuilder name,int count);
 [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr window,out Rect rect);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr window);
 [DllImport("user32.dll")] static extern bool IsIconic(IntPtr window);
 [DllImport("user32.dll")] static extern bool ShowWindowAsync(IntPtr window,int command);
 [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr window);
 [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr window,uint flags);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern bool GetMonitorInfo(IntPtr monitor,ref MonitorInfo info);
 [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr window,IntPtr after,int x,int y,int width,int height,uint flags);
 public static IntPtr Find(int pid) {
  IntPtr best=IntPtr.Zero;long score=-1;
  EnumWindows((window,value)=>{uint owner;GetWindowThreadProcessId(window,out owner);if(owner!=pid)return true;
   var name=new StringBuilder(256);GetClassName(window,name,name.Capacity);if(name.ToString()!="Chrome_WidgetWin_1")return true;
   Rect rect;if(!GetWindowRect(window,out rect))return true;int w=rect.Right-rect.Left,h=rect.Bottom-rect.Top;if((w<200||h<150)&&!IsIconic(window))return true;
   long rank=(long)w*h+(IsWindowVisible(window)?1000000000000L:0);if(rank>score){score=rank;best=window;}return true;
  },IntPtr.Zero);return best;
 }
 public static bool Reveal(IntPtr window,int pid) {
  uint owner;GetWindowThreadProcessId(window,out owner);if(window==IntPtr.Zero||owner!=pid)return false;
  ShowWindowAsync(window,IsIconic(window)?9:5);
  if(MonitorFromWindow(window,0)==IntPtr.Zero){var info=new MonitorInfo();info.Size=Marshal.SizeOf(typeof(MonitorInfo));
   if(GetMonitorInfo(MonitorFromWindow(window,2),ref info)){Rect r;GetWindowRect(window,out r);int w=Math.Min(r.Right-r.Left,info.Work.Right-info.Work.Left),h=Math.Min(r.Bottom-r.Top,info.Work.Bottom-info.Work.Top);SetWindowPos(window,IntPtr.Zero,info.Work.Left,info.Work.Top,w,h,0x54);}}
  return SetForegroundWindow(window);
 }
}
