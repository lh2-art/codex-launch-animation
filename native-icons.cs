using System;
using System.Text;
using System.Runtime.InteropServices;
public static class StartupIcons {
 [StructLayout(LayoutKind.Sequential,Pack=4)] struct Key { public Guid Format;public uint Id;public Key(uint id){Format=new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3");Id=id;} }
 [StructLayout(LayoutKind.Explicit,Size=24)] struct Value { [FieldOffset(0)]public ushort Type;[FieldOffset(8)]public IntPtr Text; }
 [ComImport,Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface Store {
  uint GetCount();void GetAt(uint index,out Key key);void GetValue(ref Key key,out Value value);void SetValue(ref Key key,ref Value value);void Commit();
 }
 [DllImport("shell32.dll",PreserveSig=false)] static extern void SHGetPropertyStoreForWindow(IntPtr window,ref Guid iid,[MarshalAs(UnmanagedType.Interface)]out Store store);
 [DllImport("ole32.dll")] static extern int PropVariantClear(ref Value value);
 [DllImport("user32.dll",SetLastError=true)] static extern IntPtr SendMessageTimeout(IntPtr window,uint message,IntPtr wParam,IntPtr lParam,uint flags,uint timeout,out IntPtr result);
 [DllImport("user32.dll",EntryPoint="GetClassLongPtrW")] static extern IntPtr GetClassLongPtr(IntPtr window,int index);
 static Store Open(IntPtr window){var iid=new Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99");Store store;SHGetPropertyStoreForWindow(window,ref iid,out store);return store;}
 public static string ReadProperty(IntPtr window,uint id){var store=Open(window);try{var key=new Key(id);Value value;store.GetValue(ref key,out value);try{return value.Type==31?Marshal.PtrToStringUni(value.Text):null;}finally{PropVariantClear(ref value);}}finally{Marshal.FinalReleaseComObject(store);}}
 public static long[] ReadIcons(IntPtr window){var values=new long[5];for(int i=0;i<3;i++){IntPtr result;SendMessageTimeout(window,0x7F,new IntPtr(i),IntPtr.Zero,2,300,out result);values[i]=result.ToInt64();}values[3]=GetClassLongPtr(window,-14).ToInt64();values[4]=GetClassLongPtr(window,-34).ToInt64();return values;}
 static void Set(Store store,uint id,string text){var key=new Key(id);var value=new Value{Type=31,Text=Marshal.StringToCoTaskMemUni(text)};try{store.SetValue(ref key,ref value);}finally{PropVariantClear(ref value);}}
 public static void Repair(IntPtr window,string resource,string appId){var existing=ReadProperty(window,5);var store=Open(window);try{Set(store,3,resource);if(String.IsNullOrEmpty(existing))Set(store,5,appId);store.Commit();}finally{Marshal.FinalReleaseComObject(store);}}
}
