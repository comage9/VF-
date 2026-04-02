import { useState } from "react";

interface Column {
  key: string;
  label: string;
  render?: (value: any, row: any) => React.ReactNode;
}

interface DataTableProps {
  title: string;
  columns: Column[];
  data: any[];
  searchPlaceholder?: string;
  filterOptions?: { value: string; label: string }[];
  onSearch?: (query: string) => void;
  onFilter?: (filter: string) => void;
}

export default function DataTable({ 
  title, 
  columns, 
  data, 
  searchPlaceholder = "검색...",
  filterOptions = [],
  onSearch,
  onFilter
}: DataTableProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFilter, setSelectedFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);
    setCurrentPage(1);
    onSearch?.(query);
  };

  const handleFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const filter = e.target.value;
    setSelectedFilter(filter);
    setCurrentPage(1);
    onFilter?.(filter);
  };

  // Filter and search data
  let filteredData = data;
  
  if (searchQuery && searchQuery.length >= 2) {
    filteredData = filteredData.filter(item =>
      Object.values(item).some(value => 
        String(value).toLowerCase().includes(searchQuery.toLowerCase())
      )
    );
  }
  
  if (selectedFilter) {
    filteredData = filteredData.filter(item => {
      const categoryMatch = item.category === selectedFilter;
      const statusMatch = item.status === selectedFilter;
      return categoryMatch || statusMatch;
    });
  }

  // Pagination
  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentData = filteredData.slice(startIndex, endIndex);

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case '완료':
      case '충분':
        return 'px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800';
      case '처리중':
        return 'px-2 py-1 text-xs font-medium rounded-full bg-orange-100 text-orange-800';
      case '지연':
      case '부족':
        return 'px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800';
      case '과잉':
        return 'px-2 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800';
      default:
        return 'px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="bg-card rounded-lg border border-border shadow-sm">
      <div className="p-6 border-b border-border">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
          <div className="flex items-center space-x-4">
            {filterOptions.length > 0 && (
              <select 
                value={selectedFilter}
                onChange={handleFilterChange}
                className="px-3 py-2 border border-input rounded-lg bg-background text-foreground"
                data-testid="select-filter"
              >
                <option value="">전체</option>
                {filterOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            )}
            <input 
              type="search" 
              placeholder={searchPlaceholder}
              value={searchQuery}
              onChange={handleSearchChange}
              className="px-3 py-2 border border-input rounded-lg bg-background text-foreground placeholder-muted-foreground"
              data-testid="input-search"
            />
          </div>
        </div>
      </div>
      
      <div className="overflow-x-auto h-[600px] overflow-y-auto">
        <table className="w-full">
          <thead className="bg-muted sticky top-0">
            <tr>
              {columns.map(column => (
                <th 
                  key={column.key}
                  className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {currentData.length === 0 ? (
              <tr>
                <td 
                  colSpan={columns.length} 
                  className="px-6 py-8 text-center text-muted-foreground"
                >
                  데이터가 없습니다.
                </td>
              </tr>
            ) : (
              currentData.map((item, index) => (
                <tr key={item.id || index} className="hover:bg-muted/50" data-testid={`row-${index}`}>
                  {columns.map(column => (
                    <td key={column.key} className="px-6 py-4 whitespace-nowrap">
                      {column.render ? (
                        column.render(item[column.key], item)
                      ) : column.key === 'status' ? (
                        <span className={getStatusBadgeClass(item[column.key])}>
                          {item[column.key]}
                        </span>
                      ) : column.key.includes('Date') || column.key.includes('date') ? (
                        <span className="text-sm text-muted-foreground">
                          {new Date(item[column.key]).toLocaleDateString('ko-KR')}
                        </span>
                      ) : (
                        <span className={`text-sm ${column.key === 'name' || column.key === 'productName' ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
                          {typeof item[column.key] === 'number' ? item[column.key].toLocaleString() : item[column.key]}
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      
      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-6 py-4 border-t border-border">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              총 {filteredData.length}개 항목 중 {startIndex + 1}-{Math.min(endIndex, filteredData.length)}개 표시
            </div>
            <div className="flex items-center space-x-2">
              <button 
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 text-sm border border-input rounded hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid="button-prev-page"
              >
                이전
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const page = i + 1;
                return (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`px-3 py-1 text-sm rounded ${
                      currentPage === page 
                        ? 'bg-primary text-primary-foreground' 
                        : 'text-muted-foreground hover:bg-accent'
                    }`}
                    data-testid={`button-page-${page}`}
                  >
                    {page}
                  </button>
                );
              })}
              <button 
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1 text-sm border border-input rounded hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid="button-next-page"
              >
                다음
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
