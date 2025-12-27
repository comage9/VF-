import pandas as pd
import os

files = [
    r'analytics-dashboard-main - 복사본\examples\일별 출고 수량 보고용 - 시트4.csv',
    r'analytics-dashboard-main - 복사본\test-delivery-upload.csv'
]

for file_path in files:
    print(f"\nChecking {file_path}...")
    if not os.path.exists(file_path):
        print("File not found.")
        continue
        
    try:
        if file_path.endswith('.csv'):
            df = pd.read_csv(file_path)
        else:
            df = pd.read_excel(file_path)
            
        print(df.head())
        print(df.tail())
        # Check if hours are non-zero
        if '00' in df.columns:
            non_zero = df[['00', '12', '23']].sum().sum()
            print(f"Sum of 00, 12, 23 columns: {non_zero}")
    except Exception as e:
        print(f"Error: {e}")
