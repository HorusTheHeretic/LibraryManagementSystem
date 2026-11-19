using System.Globalization;
using System.Text;

namespace LibraryManagement.Services;

public static class Csv
{
    // UTF-8 with BOM so Excel shows symbols such as ₱ correctly
    public static byte[] Build(string[] headers, IEnumerable<object?[]> rows)
    {
        var sb = new StringBuilder();
        sb.AppendLine(string.Join(",", headers.Select(Cell)));
        foreach (var r in rows) sb.AppendLine(string.Join(",", r.Select(Cell)));
        return Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(sb.ToString())).ToArray();
    }

    static string Cell(object? v)
    {
        var s = v switch
        {
            null => "",
            DateTime d => d.ToString("yyyy-MM-dd"),
            decimal m => m.ToString("0.00", CultureInfo.InvariantCulture),
            bool b => b ? "Yes" : "No",
            IFormattable f => f.ToString(null, CultureInfo.InvariantCulture),
            _ => v.ToString() ?? ""
        };
        // Neutralise spreadsheet formula injection from user-entered text
        if (v is string && s.Length > 0 && "=+-@\t\r".Contains(s[0])) s = "'" + s;
        return s.IndexOfAny([',', '"', '\n', '\r']) >= 0 ? "\"" + s.Replace("\"", "\"\"") + "\"" : s;
    }
}
