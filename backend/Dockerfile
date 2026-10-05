FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY src/TreeEditor.Api/TreeEditor.Api.csproj src/TreeEditor.Api/
RUN dotnet restore src/TreeEditor.Api/TreeEditor.Api.csproj
COPY src/TreeEditor.Api/ src/TreeEditor.Api/
RUN dotnet publish src/TreeEditor.Api/TreeEditor.Api.csproj -c Release -o /app/publish --no-restore /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS final
WORKDIR /app
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080
COPY --from=build /app/publish .
USER app
ENTRYPOINT ["dotnet", "TreeEditor.Api.dll"]
