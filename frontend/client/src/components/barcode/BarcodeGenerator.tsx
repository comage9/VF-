import { useState, useRef, useEffect, useCallback } from "react";
import JsBarcode from "jsbarcode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

// ─── VF 기본 품목 DB (내장) ───
import DEFAULT_PRODUCT_DB from "./product-db.json";
import DEFAULT_PRODUCT_CATEGORY from "./product-category.json";

interface BarcodeItem {
  trackingNo: string;
  barcode: string;
  productName?: string;
}

export default function BarcodeGenerator() {
  const { toast } = useToast();
  const barcodeRef = useRef<SVGSVGElement>(null);

  // ─── 상태 ───
  const [dataInput, setDataInput] = useState("");
  const [items, setItems] = useState<BarcodeItem[]>([]);
  const [barcodeWidth, setBarcodeWidth] = useState(1.4);
  const [barcodeHeight, setBarcodeHeight] = useState(38);
  const [selectedBarcode, setSelectedBarcode] = useState<string | null>(null);

  // 제품 DB (localStorage + 내장)
  const [productDB, setProductDB] = useState<Record<string, string>>(() => {
    const saved = localStorage.getItem("productDB");
    if (saved) return { ...DEFAULT_PRODUCT_DB, ...JSON.parse(saved) };
    return { ...DEFAULT_PRODUCT_DB };
  });
  const [productCategory, setProductCategory] = useState<Record<string, string>>(() => {
    const saved = localStorage.getItem("productCategory");
    if (saved) return JSON.parse(saved);
    return { ...DEFAULT_PRODUCT_CATEGORY };
  });
  const [productCount, setProductCount] = useState(Object.keys(productDB).length);

  // ─── 데이터 처리 ───
  const processData = useCallback(() => {
    const lines = dataInput.trim().split("\n");
    if (lines.length === 0) return;

    const newItems: BarcodeItem[] = [];
    const sentTrackingNos = new Set(
      JSON.parse(localStorage.getItem("sentTrackingNos") || "[]")
    );

    for (const line of lines) {
      const fields = line.split("\t");
      if (fields.length < 7) continue;
      const trackingNo = fields[0].trim();
      const barcode = fields[3]?.trim() || fields[6]?.trim();
      if (!trackingNo || !barcode) continue;

      const name = productDB[barcode] || "";
      newItems.push({ trackingNo, barcode, productName: name });
    }

    setItems(newItems);
  }, [dataInput, productDB]);

  // ─── 바코드 렌더링 ───
  useEffect(() => {
    if (selectedBarcode && barcodeRef.current) {
      try {
        JsBarcode(barcodeRef.current, selectedBarcode, {
          format: "CODE128",
          width: barcodeWidth,
          height: barcodeHeight,
          displayValue: true,
          fontSize: 14,
          margin: 5,
        });
      } catch (e) {
        console.error("Barcode render error:", e);
      }
    }
  }, [selectedBarcode, barcodeWidth, barcodeHeight]);

  // ─── 제품명 조회 ───
  const getProductName = (barcode: string): string => {
    return productDB[barcode] || "";
  };

  const getCategory = (barcode: string): string => {
    return productCategory[barcode] || "";
  };

  // ─── 엑셀 업로드 ───
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const lines = text.split("\n");
    const newDB = { ...productDB };
    const newCat = { ...productCategory };
    let count = 0;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const fields = line.split(",");
      if (fields.length >= 6) {
        const barcode = fields[4]?.trim();
        const name = fields[5]?.trim();
        if (barcode && name) {
          newDB[barcode] = name;
          if (fields[6]) newCat[barcode] = fields[6].trim();
          count++;
        }
      }
    }

    setProductDB(newDB);
    setProductCategory(newCat);
    setProductCount(Object.keys(newDB).length);
    localStorage.setItem("productDB", JSON.stringify(newDB));
    localStorage.setItem("productCategory", JSON.stringify(newCat));
    toast({ title: "완료", description: `${count}개 제품 등록됨` });
  }, [productDB, productCategory, toast]);

  // ─── 개별 바코드 생성 (클릭 시) ───
  const handleBarcodeClick = (barcode: string) => {
    setSelectedBarcode(barcode);
  };

  // ─── 프린트 ───
  const handlePrint = () => {
    const svgElements = document.querySelectorAll(".barcode-svg");
    if (svgElements.length === 0) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <html><head><title>바코드 출력</title>
      <style>body{text-align:center;} svg{margin:5px;}</style></head><body>
    `);
    svgElements.forEach((svg) => {
      printWindow.document.write(svg.outerHTML);
    });
    printWindow.document.write("</body></html>");
    printWindow.document.close();
    printWindow.print();
  };

  return (
    <div className="space-y-4 p-4">
      <Card>
        <CardHeader>
          <CardTitle>바코드 관리 시스템</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 크기 조정 */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm">너비:</label>
              <input
                type="range"
                min="0.8" max="2.0" step="0.1"
                value={barcodeWidth}
                onChange={(e) => setBarcodeWidth(parseFloat(e.target.value))}
                className="w-24"
              />
              <span className="text-sm w-8">{barcodeWidth}</span>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm">높이:</label>
              <input
                type="range"
                min="25" max="60" step="1"
                value={barcodeHeight}
                onChange={(e) => setBarcodeHeight(parseInt(e.target.value))}
                className="w-24"
              />
              <span className="text-sm w-8">{barcodeHeight}</span>
            </div>
          </div>

          {/* 제품 관리 */}
          <div className="flex items-center gap-3 bg-blue-50 p-3 rounded">
            <span className="text-sm font-medium">제품 관리:</span>
            <input
              type="file"
              accept=".xls,.xlsx,.csv"
              onChange={handleFileUpload}
              className="hidden"
              id="product-file-input"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => document.getElementById("product-file-input")?.click()}
            >
              제품 엑셀 업로드
            </Button>
            <span className="text-xs text-gray-500">
              등록된 제품: {productCount}개
            </span>
          </div>

          {/* 데이터 입력 */}
          <div className="space-y-2">
            <p className="text-xs text-gray-500">
              데이터를 붙여넣기하세요 (탭 구분). 송장번호, 바코드 포함 7개 필드.
            </p>
            <textarea
              className="w-full h-24 border rounded p-2 text-sm font-mono"
              placeholder="데이터를 여기에 붙여넣기하세요..."
              value={dataInput}
              onChange={(e) => setDataInput(e.target.value)}
            />
            <div className="flex gap-2">
              <Button onClick={processData}>데이터 처리</Button>
              <Button variant="outline" onClick={() => { setItems([]); setDataInput(""); }}>
                화면 지우기
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  localStorage.removeItem("sentTrackingNos");
                  toast({ title: "초기화", description: "전송 기록 삭제됨" });
                }}
              >
                저장된 기록 삭제
              </Button>
              <span className="text-sm text-gray-500 ml-auto self-center">
                생성된 바코드: {items.length}
              </span>
            </div>
          </div>

          {/* 바코드 목록 */}
          {items.length > 0 && (
            <div className="border rounded overflow-auto max-h-[60vh]">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="p-2 text-left">송장번호</th>
                    <th className="p-2 text-left">바코드</th>
                    <th className="p-2 text-left">제품명</th>
                    <th className="p-2 text-left">분류</th>
                    <th className="p-2 text-left">바코드 이미지</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr key={idx} className="border-t hover:bg-gray-50">
                      <td className="p-2 font-mono text-xs">{item.trackingNo}</td>
                      <td className="p-2 font-mono text-xs">{item.barcode}</td>
                      <td className="p-2 text-xs">{item.productName || "-"}</td>
                      <td className="p-2 text-xs">{getCategory(item.barcode) || "-"}</td>
                      <td className="p-2">
                        <svg
                          className="barcode-svg cursor-pointer"
                          ref={selectedBarcode === item.barcode ? barcodeRef : undefined}
                          onClick={() => handleBarcodeClick(item.barcode)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
