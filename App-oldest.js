var RETRO_CATEGORIES = [{key:'GOOD',display:'THE GOOD'}, {key:'BAD',display:'THE BAD'}, {key: 'IDEAS',display:'THE IDEAS'}, {key: 'ACCLAIM', display:'THE ACCLAIM'}];

Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    padding: 10,
    items: [      // pre-define the general layout of the app; the skeleton (ie. header, content, footer)
      {
        xtype: 'container', // this container lets us control the layout of the pulldowns; they'll be added below
        itemId: 'pulldown-container',
        layout: {
          type: 'hbox',           // 'horizontal' layout
          align: 'stretch'
        }
      },
      {
        xtype: 'container', // this container is for the controls related to item submission
        itemId: 'add-new-container',
        layout: {
          align: 'bottom',
          type: 'hbox'
        },
        border: 0
      },
      {
        xtype: 'container', // this container is for the controls related to item submission
        itemId: 'item-panel-container',
        layout: {
          type: 'vbox',
          align: 'stretch'
        }
      }
    ],
    itemId:'retroApp',
    iterationStore: undefined,       // app level references to the store and grid for easy access in various methods
    retroItemsPanel: undefined,

    // Entry Point to App
    launch: function() {
      var me = this;                     // convention to hold a reference to the 'app' itself; reduce confusion of 'this' all over the place; when you see 'me' it means the 'app'
      console.log('our second app');     // see console api: https://developers.google.com/chrome-developer-tools/docs/console-api
      me._renderSubmissionField();
      me._loadIterations();
    },

    _handleSubmitClick: function(button){
      var userResult = Rally.environment.getContext().getUser();
      var me = button.up('#retroApp');
      var tf = me.down('#add-new-text-box').getValue();
      var comboBox = me.down('#add-new-combo-box').getValue();
      var user = '';
      if(me.down('#add-new-anonymous-check-box').getValue()) {
        user = {'name':'Anonymous', 'uid':-1};
      }
      else {
        user = {'name':userResult.UserName, 'uid':userResult.ObjectID};
      }

      console.log('New Feedback Submitted - ', tf, comboBox, user);
      var newRetroItem ={'description': tf, 'user': user, 'votes': {'count':0, 'voted':[]}, 'handled':false};
      me.retroItems[comboBox].push(newRetroItem);
      me.down('#panel-'+comboBox).add(me._createItemContainer(newRetroItem));
      me._updateData();
      me.down('#add-new-text-box').setValue('');
    },

    _renderSubmissionField: function() {
      try {
        var me = this;
        var itemDescription = '';
        var button = Ext.create('Rally.ui.Button', {
          itemId: 'add-new-submit-button',
          text: 'Add',
          handler: me._handleSubmitClick,
          disabled: true,
          margin: 5,
          flex: 1
        });
        var textInput = Ext.create('Rally.ui.TextField', {
          itemId: 'add-new-text-box',
          emptyText: 'Enter a short description of your retro item',
          fieldLabel: 'ADD NEW RETRO ITEM',
          labelSeparator: '',
          flex: 8,
          height: 40,
          labelAlign: 'top',
          margin: 5,

          listeners: {
            change: function(cmp, newContent) {
              if (_.isEmpty(newContent)) {
                button.disable();
              } else {
                button.enable();
              }
            },
            specialkey: function(field, e) {
              if (e.getKey() === e.ENTER &&
                  !button.isDisabled()) {
                me._handleSubmitClick(button);
              }
            }
          }
        });
        var checkbox = Ext.create('Rally.ui.CheckboxField', {
          itemId: 'add-new-anonymous-check-box',
          fieldLabel: 'Anonymous',
          labelSeparator: '',
          value: true,
          flex: 1,
          labelAlign: 'right',
          margin: 5
        });
        var category = Ext.create('Rally.ui.combobox.ComboBox', {
          itemId: 'add-new-combo-box',
          fieldLabel: 'CATEGORY',
          flex: 1,
          labelAlign: 'top',
          margin: 5,

          store: _.pluck(RETRO_CATEGORIES, 'key')
        });

        me.down('#add-new-container').add(textInput);
        me.down('#add-new-container').add(category);
        me.down('#add-new-container').add(checkbox);
        me.down('#add-new-container').add(button);
      } catch (e) {
        console.log(e);
      }
    },

    // create and load iteration pulldown
    _loadIterations: function() {
        var me = this;
        var iterComboBox = Ext.create('Rally.ui.combobox.IterationComboBox', {
          itemId: 'iteration-combobox',     // we'll use this item ID later to get the users' selection
          fieldLabel: 'Retroapptive for iteration',
          labelCls:'x-panel-header-text-container-default',
          labelAlign: 'left',

          labelWidth: 300,
          width: 600,
          listeners: {
            ready: me._loadData,      // initialization flow: next, load severities
            select: me._loadData,           // user interactivity: when they choose a value, (re)load the data
            scope: me
        }
        });

        this.down('#pulldown-container').add(iterComboBox);  // add the iteration list to the pulldown container so it lays out horiz, not the app!
    },


    // construct filters for defects with given iteration (ref) value
    _getFilters: function(iterationValue) {

      var iterationFilter = Ext.create('Rally.data.wsapi.Filter', {
              property: 'ObjectID',
              operation: '=',
              value: iterationValue
      });

      return iterationFilter;
    },

    // Get data from Rally
    _loadData: function() {

      var me = this;

      var selectedIterRef = this.down('#iteration-combobox').getRecord().get('ObjectID');              // the _ref is unique, unlike the iteration name that can change; lets query on it instead!
      var myFilters = this._getFilters(selectedIterRef);

      console.log('Iteration Filter:', myFilters.toString());

      // if store exists, just load new data
      if (me.iterationStore) {
        console.log('store exists');
        me.iterationStore.setFilter(myFilters);
        me.iterationStore.load();

      // create store
      } else {
        console.log('creating store');
        me.iterationStore = Ext.create('Rally.data.wsapi.Store', {     // create iterationStore on the App (via this) so the code above can test for it's existence!
          model: 'Iteration',
          autoLoad: true,                         // <----- Don't forget to set this to true! heh
          filters: myFilters,
          listeners: {
              load: function(myStore, myData, success) {
                console.log(success, myStore, myData);
                if (!me.retroItemsPanel) {           // only create a grid if it does NOT already exist
                  me._createGrid(myStore);      // if we did NOT pass scope:this below, this line would be incorrectly trying to call _createGrid() on the store which does not exist.
                }
              },
              scope: me                         // This tells the wsapi data store to forward pass along the app-level context into ALL listener functions
          },
          fetch: ['FormattedID', 'Name', 'Notes']   // Look in the WSAPI docs online to see all fields available!
        });
      }
    },

    _updateData: function() {
      try {
        var me = this;
        var resultStr = JSON.stringify(me.retroItems);
        me.iterationStore.data.items[0].set('Notes', resultStr)
        me.iterationStore.data.items[0].save();
        // TODO: make a new '_updateAccordionItems' function that does not re-create the elements
        // but instead only updates the dynamic data in the elements (vote disable/enable, vote count) and removes deleted elements
        if(!me.down('#item-panel')) {
          me._createAccordionPanel();
        }
        console.log('Commited Changes to current Rally Iteration', me.retroItems);
      } catch(e) {
        console.log(e);
      }
    },

    // Create and Show a Grid of given defect
    _createGrid: function(myiterationStore) {

      var me = this;

      this.retroItems = {};
      try {
        var iterationNotes = myiterationStore.data.items[0].data.Notes;
        if (iterationNotes) {
          this.retroItems = JSON.parse(iterationNotes);
        }
        else {
          _.forEach(RETRO_CATEGORIES, function(category) {
            me.retroItems[category.key] = [];
          });
        }
        console.log('Iteration Feedback Data:', this.retroItems);
      } catch (e) {
        console.log(e);
      }

      try {

        me.retroItemsPanel = Ext.create('Ext.panel.Panel', {
            itemId:'item-panel',
           margin:'10 0 0 0',
           border: false,
            defaults: {
                // applied to each contained panel
                bodyStyle: 'padding:15px'
            }
        });
      } catch(e) {
        console.log(e);
      }

      me.down('#item-panel-container').add(me.retroItemsPanel);       // add the grid Component to the app-level Container (by doing this.add, it uses the app container)
      me._createAccordionPanel();
    },

    // Handle what happens when the user clicks Delete for a retroItem.
    // 'this' is expected to be the button scope
    _handleDeleteClick: function(button){//
      console.log('Deleting item');
      var retroContainer = button.up('container');
      var retroItem = retroContainer.retroItem;
      var retroContainerBox = button.up('container');
      var me = button.up('#retroApp');
      console.log(me.retroItems);
      _.forEach(RETRO_CATEGORIES, function(category) {
          var itemRef = _.find(me.retroItems[category.key], function(item) {return _.isEqual(item, retroItem)});
          if(itemRef){
              _.remove(me.retroItems[category.key], itemRef);
              var panel = button.up('#panel-'+category.key);
              panel.remove(retroContainerBox);
              me._createAccordionPanel();
          }
        }, button);

      me._updateData();
    },

    // Handle what happens when the user clicks Vote for a retroItem.
    _handleVoteClick: function(button){
      console.log('Voting on item');
      var retroItem = button.up('container').retroItem;
      var me = button.up('#retroApp');
      var controlsContainer = button.up('#controls-container');

      // toggle cls on button press
      me._toggleButtonState(button);

      _.forEach(RETRO_CATEGORIES, function(category) {
          var itemRef = _.find(me.retroItems[category.key], function(item) {return _.isEqual(item, retroItem)});
          var voter = {'name':Rally.environment.getContext().getUser().UserName, 'uid':Rally.environment.getContext().getUser().ObjectID};
          if(itemRef){
            var userHasVoted = _.contains(_.pluck(retroItem.votes['voted'], 'uid'), voter.uid);
            if(!userHasVoted){
              itemRef.votes['count'] += 1;
              retroItem.votes['count'] += 1;
              itemRef.votes['voted'].push(voter);
              retroItem.votes['voted'].push(voter);
              var userImage = Ext.create('Ext.Img', {
                  itemId: 'voterImage-image-'+voter.uid,
                  src: 'https://rally1.rallydev.com/slm/profile/viewThumbnailImage.sp?uid=' + voter.uid,
                  height: 25,
                  width: 25,
                  margin: 1,
              });
              controlsContainer.add(userImage);
            } else {
              itemRef.votes['count'] -= 1;
              retroItem.votes['count'] -= 1;

              var voterRef = _.find(itemRef.votes['voted'], function(voterRecord) {return _.isEqual(voterRecord, voter)});
              _.remove(itemRef.votes['voted'],voterRef);
              _.remove(retroItem.votes['voted'],voterRef);
              var userImage = controlsContainer.down('#voterImage-image-'+voter.uid);

              controlsContainer.remove(userImage);
            }
            button.setText(itemRef.votes['count']);
          }
        });
        //https://lodash.com/docs#forEach
      me._updateData();
    },

    // Handle what happens when the user clicks Vote for a retroItem.
    _handleHandledClick: function(button){
      var retroContainer = button.up('container');
      var retroItem = retroContainer.retroItem;
      var me = button.up('#retroApp');

      // toggle cls on button press
      me._toggleButtonState(button);

      _.forEach(RETRO_CATEGORIES, function(category) {
          var itemRef = _.find(me.retroItems[category.key], function(item) {return _.isEqual(item, retroItem)});
          if(itemRef){
            itemRef.handled = !itemRef.handled;
            retroItem.handled = !retroItem.handled;
          }
        });
        //https://lodash.com/docs#forEach
      me._updateData();
    },

    _toggleButtonState: function(button) {
      if (button.hasCls('primary')) {
        button.removeCls('primary');
        button.addCls('secondary');
      } else {
        button.removeCls('secondary');
        button.addCls('primary');
      }
    },

    // create the UI container for a retroItem
    // 'this' is expected to be the CustomApp
    _createItemContainer: function(retroItem) {
      var me = this;
      console.log(retroItem);
      console.log(me);
      // var textBox = Ext.create('Ext.draw.Text', {
      //     itemId: 'text-retro-item',
      //     text: retroItem.description,
      //     fontFamily: '',
      //     font: 16
      //   });
      var textBox = {
        border: 0,
        marginTop: 0,

        html: '<div style="font-size: 13px;">' + retroItem.description + '</div>'
      };
      var button = Ext.create('Rally.ui.Button', {
          itemId: 'delete-retro-item-button',
          iconCls: 'icon-delete',
          cls:'secondary rly-small',
          handler: me._handleDeleteClick,
          align: 'right',
          disabled: false
        });
      var userHasVoted = _.contains(_.pluck(retroItem.votes['voted'], 'uid'), Rally.environment.getContext().getUser().ObjectID);
      var votedLabelTxt = retroItem.votes['count'];
      var voteButton = Ext.create('Rally.ui.Button', {
          itemId: 'vote-retro-item-button',
          cls: ((userHasVoted) ? 'primary' : 'secondary') + ' rly-small',
          iconCls: 'icon-thumbs-up',
          text: votedLabelTxt,
          handler: me._handleVoteClick,
          align: 'right',
        });
      var handledButton = Ext.create('Rally.ui.Button', {
          itemId: 'handled-retro-item-button',
          iconCls: 'icon-ready',
          cls: ((retroItem.handled)?'primary':'secondary')+' rly-small',
          handler: me._handleHandledClick,
          added: me._setHandledButtonState,
          align: 'right'
        });
      handledButton.applyState(retroItem.handled);

      var imgURI = 'https://help.rallydev.com/apps/2.0/doc/images/main-header-logo.png';
      if (retroItem.user.uid > 0) {
        imgURI = 'https://rally1.rallydev.com/slm/profile/viewThumbnailImage.sp?uid=' + retroItem.user.uid;
      }
      var submitterImage = Ext.create('Ext.Img', {
          itemId: 'submitter-image',
          src: imgURI,
          height: 25,
          width: 25
      });

      var textSeparator = Ext.create('Ext.draw.Text', {
          itemId: 'separatorText',
          text: '',
          width: 25,
          layout: {
            align: 'center'
          },
      });
      var items = [submitterImage, textSeparator, handledButton, button, voteButton];
      _.forEach(retroItem.votes['voted'], function(voter) {
        var voterImage = Ext.create('Ext.Img', {
            itemId: 'voterImage-image-'+voter.uid,
            src: 'https://rally1.rallydev.com/slm/profile/viewThumbnailImage.sp?uid=' + voter.uid,
            height: 25,
            width: 25,
            margin: 1,
        });
        items.push(voterImage);
      });

      var controls = Ext.create('Ext.container.Container', {
        itemId: 'controls-container',
        layout: {
          type: 'hbox'
        },
        items: items,
        retroItem: retroItem
      });

      return Ext.create('Ext.container.Container', {
                          layout: {
                                  type: 'vbox'
                          },
                          // cls: 'retro-item-container',
                          // itemId: 'retro-item-container',

                          padding: 5,
                          border: 1,

                          items: [controls, textBox],
                          // retroItem: retroItem
                        });
    },

    // Creates an array of retroItem Components according to the contents of retroItems
    // 'this' is expected to be the CustomApp
    _createAccordionItems: function() {
      var me = this;
      console.log(me);
      return _.map(RETRO_CATEGORIES, function(category) {
              return {
                title: category.display,
                itemId: 'panel-'+category.key,
                items: _.map(me.retroItems[category.key], me._createItemContainer, me),
                category: category
              };
            },me);
    },

    // Update the UI accordion panel according to the contents of retroItems
    // 'this' is expected to be the CustomApp
    _createAccordionPanel: function(){
      var me = this;
      var accordion = me.down('#item-panel');
      accordion.removeAll();
      _.map(me._createAccordionItems(), function(item) {
        accordion.add(item);
      })
    }
});