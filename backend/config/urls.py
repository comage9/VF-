from django.contrib import admin
from django.urls import path, include
from django.http import HttpResponse
from django.conf import settings
from django.conf.urls.static import static

def root_view(request):
    return HttpResponse("VF Analytics Backend Running - API: /api/")

urlpatterns = [
    path('', root_view),
    path('admin/', admin.site.urls),
    path('api/', include('sales_api.urls')),
    path('departure/', include('departure.urls')),
    path('truck-freight/', include('truck_freight.urls')),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)