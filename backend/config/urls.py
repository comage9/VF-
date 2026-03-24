from django.contrib import admin
from django.urls import path, include
from django.http import HttpResponse

def root_view(request):
    return HttpResponse("VF Analytics Backend Running - API: /api/")

urlpatterns = [
    path('', root_view),
    path('admin/', admin.site.urls),
    path('api/', include('sales_api.urls')),
]