chatwidgetcira/update_mobile.py
```python
import re

with open('chat-widget-v2.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Add viewport meta tag after the return check
old_init = 'if(document.getElementById("n8n-chat-widget")) return;'
new_init = '''if(document.getElementById("n8n-chat-widget")) return;

  // Ensure viewport meta tag for mobile responsiveness
  var viewport = document.querySelector('meta[name="viewport"]');
  if (!viewport) {
    viewport = document.createElement('meta');
    viewport.name = 'viewport';
    document.head.appendChild(viewport);
  }
  viewport.content = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no';'''

content = content.replace(old_init, new_init)

# Replace the mobile media query with enhanced responsive styles
old_media = '''"@media(max-width:480px){",
    "  .cira-bubble-win{width:100%;right:0;bottom:0;border-radius:14px 14px 0 0;height:75vh;}",
    "}"'''

new_media = '''"@media(max-width:480px){",
    "  .cira-bubble-win{width:100%;right:0;bottom:0;border-radius:14px 14px 0 0;height:90vh;max-height:90vh;}",
    "  .cira-body{padding:12px;gap:8px;}",
    "  .cira-msg{font-size:13px;padding:10px 12px;}",
    "  .cira-avatar{width:24px;height:24px;}",
    "  .cira-note{font-size:10px;padding:5px 10px;}",
    "  .cira-footer{padding:8px;gap:6px;}",
    "  .cira-textarea{font-size:13px;padding:8px 12px;height:38px;}",
    "  .cira-send{width:36px;height:36px;font-size:14px;}",
    "  .cira-bubble-btn{width:52px;height:52px;font-size:20px;bottom:16px;right:16px;}",
    "  .cira-bubble-header{padding:10px 12px;}",
    "  .cira-bubble-header-name{font-size:14px;}",
    "  .cira-bubble-header-sub{font-size:10px;}",
    "  .cira-bubble-header img{width:30px;height:30px;}",
    "}",
    "@media(max-height:700px){",
    "  .cira-bubble-win{height:85vh;}",
    "}"'''

content = content.replace(old_media, new_media)

with open('chat-widget-v2.js', 'w', encoding='utf-8') as f:
    f.write(content)

print('Done - viewport and responsive CSS updated')
