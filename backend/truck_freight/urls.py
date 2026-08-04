from django.urls import path
from . import views

urlpatterns = [
    path("api/list", views.api_list, name="truck-freight-list"),
    path("api/detail/<int:pk>", views.api_detail, name="truck-freight-detail"),
    path("api/detail/<int:pk>/photo", views.api_photo, name="truck-freight-photo"),
    path("api/summary", views.api_summary, name="truck-freight-summary"),
    path("api/import", views.api_import, name="truck-freight-import"),
]
