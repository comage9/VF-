/**
 * VF 생산 계획 페이지 - 색상 매핑 유틸리티
 * 적용 원칙: 방안 A (텍스트+배경)
 */

export interface ColorStyle {
  textColor: string;
  backgroundColor: string;
  borderColor?: string;
  isSpecial?: boolean; // 화이트/아이보리 계열 여부
}

export interface ColorMapping {
  [colorName: string]: ColorStyle;
}

export type VFColorName = 
  | "Black" | "Brown" | "Dark Brown" | "Gray1" | "Gray2" | "Gray3" | "Gray4"
  | "Green" | "Dark Green" | "NAVY1" | "Navy2" | "Modern Blue(B3)" | "BLUE(B2)"
  | "EU BLUE" | "Dark O" | "Mint1" | "Mint2" | "Violet" | "Baige" | "Orange"
  | "EU YELLO" | "Yello" | "Butter" | "Pink(P2)" | "Pink(P3)" | "Kaki(BRIDA)"
  | "Orange(BRIDA)" | "Yello(BRIDA)" | "O" | "Ratan Deep Green" | "Navy(BRIDA)"
  | "EU RED"
  | "WHITE1" | "Simple White" | "Ratan White" | "Decos WHITE" | "LOTTE WHITE1"
  | "WHITE(BRIDA)" | "WHITE2" | "IVORY" | "Simple Ivory" | "Ratan Ivory" | "IVORY2";

/**
 * VF 프로젝트 색상 매핑 테이블 (방안 A 기준)
 * 일반 색상: 텍스트 컬러만 적용 (배경: #FFFFFF)
 * 화이트/아이보리 계열: 텍스트 + 배경 모두 적용
 */
export const VF_COLOR_MAPPING: Readonly<ColorMapping> = {
  // 일반 색상 (텍스트만)
  "Black": { textColor: "#000000", backgroundColor: "#FFFFFF" },
  "Brown": { textColor: "#8B4513", backgroundColor: "#FFFFFF" },
  "Dark Brown": { textColor: "#5D4037", backgroundColor: "#FFFFFF" },
  "Gray1": { textColor: "#808080", backgroundColor: "#FFFFFF" },
  "Gray2": { textColor: "#A9A9A9", backgroundColor: "#FFFFFF" },
  "Gray3": { textColor: "#696969", backgroundColor: "#FFFFFF" },
  "Gray4": { textColor: "#D3D3D3", backgroundColor: "#FFFFFF" },
  "Green": { textColor: "#228B22", backgroundColor: "#FFFFFF" },
  "Dark Green": { textColor: "#006400", backgroundColor: "#FFFFFF" },
  "NAVY1": { textColor: "#000080", backgroundColor: "#FFFFFF" },
  "Navy2": { textColor: "#191970", backgroundColor: "#FFFFFF" },
  "Modern Blue(B3)": { textColor: "#1E90FF", backgroundColor: "#FFFFFF" },
  "BLUE(B2)": { textColor: "#4169E1", backgroundColor: "#FFFFFF" },
  "EU BLUE": { textColor: "#4682B4", backgroundColor: "#FFFFFF" },
  "Dark O": { textColor: "#2F4F4F", backgroundColor: "#FFFFFF" },
  "Mint1": { textColor: "#98FB98", backgroundColor: "#FFFFFF" },
  "Mint2": { textColor: "#3CB371", backgroundColor: "#FFFFFF" },
  "Violet": { textColor: "#8A2BE2", backgroundColor: "#FFFFFF" },
  "Baige": { textColor: "#F5F5DC", backgroundColor: "#FFFFFF" },
  "Orange": { textColor: "#FFA500", backgroundColor: "#FFFFFF" },
  "EU YELLO": { textColor: "#FFD700", backgroundColor: "#FFFFFF" },
  "Yello": { textColor: "#FFFF00", backgroundColor: "#FFFFFF" },
  "Butter": { textColor: "#FFFACD", backgroundColor: "#FFFFFF" },
  "Pink(P2)": { textColor: "#FFC0CB", backgroundColor: "#FFFFFF" },
  "Pink(P3)": { textColor: "#DB7093", backgroundColor: "#FFFFFF" },
  "Kaki(BRIDA)": { textColor: "#C3B091", backgroundColor: "#FFFFFF" },
  "Orange(BRIDA)": { textColor: "#FF8C00", backgroundColor: "#FFFFFF" },
  "Yello(BRIDA)": { textColor: "#FFD700", backgroundColor: "#FFFFFF" },
  "O": { textColor: "#708090", backgroundColor: "#FFFFFF" },
  "Ratan Deep Green": { textColor: "#2E8B57", backgroundColor: "#FFFFFF" },
  "Navy(BRIDA)": { textColor: "#000080", backgroundColor: "#FFFFFF" },
  "EU RED": { textColor: "#DC1434", backgroundColor: "#FFFFFF" },

  // 화이트/아이보리 계열 (텍스트+배경) - 특별 처리
  "WHITE1": { 
    textColor: "#000000", 
    backgroundColor: "#F5F5F5",
    isSpecial: true
  },
  "Simple White": { 
    textColor: "#000000", 
    backgroundColor: "#F5F5F5",
    isSpecial: true
  },
  "Ratan White": { 
    textColor: "#000000", 
    backgroundColor: "#F5F5F5",
    isSpecial: true
  },
  "Decos WHITE": { 
    textColor: "#000000", 
    backgroundColor: "#F5F5F5",
    isSpecial: true
  },
  "LOTTE WHITE1": { 
    textColor: "#000000", 
    backgroundColor: "#F5F5F5",
    isSpecial: true
  },
  "WHITE(BRIDA)": { 
    textColor: "#000000", 
    backgroundColor: "#F5F5F5",
    isSpecial: true
  },
  "WHITE2": { 
    textColor: "#696969", 
    backgroundColor: "#FFF8DC",
    isSpecial: true
  },
  "IVORY": { 
    textColor: "#8B7355", 
    backgroundColor: "#FFF8DC",
    isSpecial: true
  },
  "Simple Ivory": { 
    textColor: "#8B7355", 
    backgroundColor: "#FFF8DC",
    isSpecial: true
  },
  "Ratan Ivory": { 
    textColor: "#8B7355", 
    backgroundColor: "#FFF8DC",
    isSpecial: true
  },
  "IVORY2": { 
    textColor: "#A0522D", 
    backgroundColor: "#FAF0E6",
    isSpecial: true
  },
} as const;

/**
 * 특수 계열 매핑 (동일 색상 적용)
 */
export const SPECIAL_SERIES_MAPPING: Readonly<{ [series: string]: string }> = {
  // Simple 계열
  "Simple Gray1": "Gray1",
  "Simple Gray2": "Gray2",
  "Simple Butter": "Butter",
  "Simple Navy1": "NAVY1",
  "Simple Pink3": "Pink(P3)",
  "Simple Blue3": "Modern Blue(B3)",
  "Simple Mint1": "Mint1",

  // Ratan 계열
  "Ratan Brown": "Brown",
  "Ratan Butter": "Butter",

  // Decos 계열
  "Decos Butter": "Butter",
  "Decos NAVY2": "Navy2",
  "Decos Gray2": "Gray2",
  "Decos Pink3": "Pink(P3)",
  "Decos NAVY1": "NAVY1",
  "Decos Gray1": "Gray1",

  // Happy 계열
  "Happy (B3)": "Modern Blue(B3)",
  "Happy (Butter)": "Butter",
  "Happy (Gray2)": "Gray2",
  "Happy (PINK3)": "Pink(P3)",

  // Extra Large Body 계열
  "Extra Large Body (Blue3)": "Modern Blue(B3)",
  "Extra Large Body (Butter)": "Butter",
  "Extra Large Body (Gray2)": "Gray2",
  "Extra Large Body (PINK3)": "Pink(P3)",
} as const;

/**
 * 색상명으로 스타일 가져오기 (타입 안전 버전)
 * @param colorName 색상 이름
 * @returns ColorStyle 객체 또는 null
 */
export function getColorStyle(colorName: VFColorName | string): ColorStyle | null {
  // 1. 직접 매핑 확인
  if (colorName in VF_COLOR_MAPPING) {
    return { ...VF_COLOR_MAPPING[colorName as keyof typeof VF_COLOR_MAPPING] };
  }

  // 2. 특수 계열 매핑 확인
  if (colorName in SPECIAL_SERIES_MAPPING) {
    const baseColor = SPECIAL_SERIES_MAPPING[colorName as keyof typeof SPECIAL_SERIES_MAPPING];
    if (baseColor in VF_COLOR_MAPPING) {
      return { ...VF_COLOR_MAPPING[baseColor as keyof typeof VF_COLOR_MAPPING] };
    }
  }

  // 3. 기본 스타일 반환
  return null;
}

/**
 * 모든 색상 이름 목록 가져오기
 */
export function getAllColorNames(): VFColorName[] {
  return Object.keys(VF_COLOR_MAPPING) as VFColorName[];
}

/**
 * 특수 색상(화이트/아이보리 계열) 여부 확인
 */
export function isSpecialColor(colorName: VFColorName | string): boolean {
  const style = getColorStyle(colorName);
  return style?.isSpecial || false;
}

/**
 * 색상 존재 여부 확인
 */
export function hasColor(colorName: VFColorName | string): boolean {
  return getColorStyle(colorName) !== null;
}

/**
 * 기본 스타일 (검정 텍스트 + 흰색 배경)
 */
export function getDefaultStyle(): ColorStyle {
  return {
    textColor: "#000000",
    backgroundColor: "#FFFFFF"
  };
}

/**
 * CSS 스타일 문자열 생성
 * @param colorStyle ColorStyle 객체
 * @returns CSS 문자열
 */
export function getCssStyle(colorStyle: ColorStyle): string {
  const { textColor, backgroundColor } = colorStyle;
  return `color: ${textColor}; background-color: ${backgroundColor};`;
}

/**
 * React 스타일 객체 생성
 * @param colorStyle ColorStyle 객체
 * @returns React 스타일 객체
 */
export function getReactStyle(colorStyle: ColorStyle): React.CSSProperties {
  const { textColor, backgroundColor, isSpecial } = colorStyle;
  const style: React.CSSProperties = {
    color: textColor,
    backgroundColor: backgroundColor,
  };
  
  if (isSpecial) {
    style.padding = "4px 8px";
    style.borderRadius = "4px";
    style.border = "1px solid #E0E0E0";
  }
  
  return style;
}

/**
 * 색상명으로 React 스타일 직접 생성
 */
export function createReactStyle(colorName: VFColorName | string): React.CSSProperties | null {
  const style = getColorStyle(colorName);
  return style ? getReactStyle(style) : null;
}

/**
 * React Hook: 색상 스타일 가져오기
 */
export function useColorStyle(colorName: VFColorName | string): ColorStyle | null {
  // React의 useMemo를 사용한 최적화
  // 실제 React 환경에서는 import { useMemo } from 'react' 필요
  return getColorStyle(colorName);
}

/**
 * styled-components/Emotion 유틸리티
 */
export function createColorStyle(colorName: VFColorName | string) {
  const style = getColorStyle(colorName);
  return style ? {
    color: style.textColor,
    backgroundColor: style.backgroundColor,
    borderColor: style.borderColor
  } : {};
}

// 사용 예제
if (typeof window !== 'undefined') {
  console.log("VF 색상 매핑 유틸리티 로드 완료");
  console.log("사용 가능한 색상 수:", Object.keys(VF_COLOR_MAPPING).length);
  
  // 테스트
  const testColors = ["WHITE1", "IVORY", "Gray1", "Brown"];
  testColors.forEach(color => {
    const style = getColorStyle(color);
    console.log(`${color}:`, style);
  });
}